import {and,desc,eq,getTableColumns,isNull,sql} from "drizzle-orm";
import {db} from "@/lib/db";
import {notifications,applications,countries,visaTypes} from "@/db/schema";
import {qualifiedTable} from "./database-schema";
import type {NotificationFilter} from "./queries";

// Agency-only read model derived from the existing recipient/action predicates.
// Staff feeds and notification delivery continue to use the original query.
export async function listAgencyNotifications(userId: string, limit: number, filter: NotificationFilter, options: {agencyId:string;unread?:boolean;q?:string;offset?:number;financial?:boolean;excludeAction?:boolean;groupPage?:{page:number;size:number}}) {
  const conditions = [
    eq(notifications.userId, userId),

  ];
  const table = (name: string) => sql.raw(qualifiedTable(name));
  if (filter === "messages") conditions.push(eq(notifications.type, "MESSAGE_POSTED"));
  if (filter === "wallet") conditions.push(sql`(${notifications.type} like '%WALLET%' or ${notifications.type} = 'TOPUP_REQUESTED')`);
  if (filter === "applications") conditions.push(sql`${notifications.applicationId} is not null and ${notifications.type} <> 'MESSAGE_POSTED' and ${notifications.type} not like '%WALLET%'`);
  const actionCondition=sql`(
    exists (select 1 from ${table("users")} recipient
      join ${table("applications")} dossier on dossier.id = ${notifications.applicationId}
      join ${table("statuses")} state on state.id = dossier.status_id
      where recipient.id = ${userId} and not state.is_terminal and (
        (recipient.agency_id = dossier.agency_id and ${notifications.type} in ('DOCUMENT_REQUESTED','DOCUMENT_REJECTED','RESUBMISSION_REQUIRED')
          and exists (select 1 from ${table("document_requests")} requested where requested.application_id = dossier.id and requested.status = 'OPEN'
            and requested.id = ${notifications.documentRequestId}))
        or (recipient.agency_id is null and (
          (${notifications.type} = 'APPLICATION_SUBMITTED' and state.code = 'SUBMITTED')
          or (${notifications.type} = 'CANCELLATION_REQUESTED' and exists (
            select 1 from ${table("application_cancellation_requests")} cancellation
            where cancellation.application_id=dossier.id and cancellation.status='PENDING'))
          or (${notifications.type} = 'DOCUMENT_REQUEST_FULFILLED' and exists (
            select 1 from ${table("document_requests")} requested join ${table("documents")} file on file.id=requested.fulfilled_document_id
            where requested.id=${notifications.documentRequestId} and requested.application_id=dossier.id and requested.status='FULFILLED' and file.status in ('UPLOADED','UNDER_REVIEW') and file.version = (
              select max(history.version) from ${table("documents")} history where history.application_id = dossier.id and history.checklist_item_id = file.checklist_item_id)))))))
    or (${notifications.type} = 'TOPUP_REQUESTED' and exists (
      select 1 from ${table("wallet_topup_requests")} topup where topup.id=${notifications.topupRequestId} and topup.agency_id = ${notifications.agencyId} and topup.status = 'PENDING'))
    or (${notifications.type} = 'REGISTRATION_SUBMITTED' and exists (
      select 1 from ${table("agency_registrations")} registration where ${notifications.link}='/admin/registrations/' || registration.id::text and registration.status in ('PENDING','UNDER_REVIEW')))
  )`;
  if (filter === "action") conditions.push(actionCondition);
  if (options) {
    // Agency opt-in only. Never change the shared Staff feed defaults.
    conditions.push(sql`exists (select 1 from ${table("users")} recipient where recipient.id=${userId} and recipient.agency_id=${options.agencyId})`);
    conditions.push(sql`(${notifications.agencyId} is null or ${notifications.agencyId}=${options.agencyId})`);
    conditions.push(sql`(${notifications.applicationId} is null or ${applications.agencyId}=${options.agencyId})`);
    if (options.unread) conditions.push(isNull(notifications.readAt));
    if(options.excludeAction) conditions.push(sql`not (${actionCondition})`);
    const q=options.q?.trim().slice(0,160);
    if(q){const pattern="%"+q.replace(/[\\%_]/g,"\\$&")+"%";conditions.push(sql`(${applications.reference} ilike ${pattern} or ${applications.countryName} ilike ${pattern} or ${applications.visaTypeName} ilike ${pattern} or ${notifications.title} ilike ${pattern} or exists (select 1 from ${table("applicants")} a where a.application_id=${applications.id} and coalesce(a.full_name,concat_ws(' ',a.first_name,a.last_name)) ilike ${pattern}))`);}
  }

  // Group by the same Algiers calendar day before pagination. An actionable event stays independent.
  const groupKey=sql<string>`case when ${notifications.applicationId} is not null and not (${actionCondition}) then 'case:' || ${notifications.applicationId}::text || ':' || to_char(${notifications.createdAt} at time zone 'Africa/Algiers','YYYY-MM-DD') else 'event:' || ${notifications.id}::text end`;
  let groupTotal:number|undefined;
  if(options.groupPage){
    const size=Math.max(3,Math.min(16,Math.floor(options.groupPage.size)));
    const page=Math.max(1,Math.min(5000,Math.floor(options.groupPage.page)));
    const keys=await db.select({key:groupKey,total:sql<number>`(count(*) over ())::int`})
      .from(notifications).leftJoin(applications,eq(notifications.applicationId,applications.id))
      .where(and(...conditions)).groupBy(sql`1`)
      .orderBy(sql`max(${notifications.createdAt}) desc`,sql`max(${notifications.id}::text) desc`)
      .limit(size).offset((page-1)*size);
    if(keys.length===0)return [];
    groupTotal=keys[0]!.total;
    conditions.push(sql`${groupKey} in (${sql.join(keys.map(k=>sql`${k.key}`),sql`, `)})`);
  }
  const selection=db
    .select({
      ...getTableColumns(notifications),
      actionRequired: options ? sql<boolean>`${actionCondition}` : sql<boolean>`false`,
      matchingTotal: groupTotal!==undefined?sql<number>`cast(${groupTotal} as integer)`:sql<number>`(count(*) over ())::int`,
      digestKey: groupKey,
      topupAmount: options?.financial ? sql<string|null>`(select topup.amount::text from ${table("wallet_topup_requests")} topup where topup.agency_id=${options.agencyId} and (topup.id=${notifications.topupRequestId} or (${notifications.type}='WALLET_TOPUP_DECIDED' and topup.reference=substring(${notifications.body} from '^Request (TOP-[0-9]{4}-[0-9]+) was '))) limit 1)` : sql<string|null>`null`,
      topupReference: options?.financial ? sql<string|null>`(select topup.reference from ${table("wallet_topup_requests")} topup where topup.agency_id=${options.agencyId} and (topup.id=${notifications.topupRequestId} or (${notifications.type}='WALLET_TOPUP_DECIDED' and topup.reference=substring(${notifications.body} from '^Request (TOP-[0-9]{4}-[0-9]+) was '))) limit 1)` : sql<string|null>`null`,
      topupCurrency: options?.financial ? sql<string|null>`(select topup.currency from ${table("wallet_topup_requests")} topup where topup.agency_id=${options.agencyId} and (topup.id=${notifications.topupRequestId} or (${notifications.type}='WALLET_TOPUP_DECIDED' and topup.reference=substring(${notifications.body} from '^Request (TOP-[0-9]{4}-[0-9]+) was '))) limit 1)` : sql<string|null>`null`,
      topupStatus: options.financial ? sql<string|null>`(select topup.status from ${table("wallet_topup_requests")} topup where topup.agency_id=${options.agencyId} and (topup.id=${notifications.topupRequestId} or (${notifications.type}='WALLET_TOPUP_DECIDED' and topup.reference=substring(${notifications.body} from '^Request (TOP-[0-9]{4}-[0-9]+) was '))) limit 1)` : sql<string|null>`null`,
      creditedAmount: options.financial ? sql<string|null>`(select tx.amount::text from ${table("wallet_topup_requests")} topup join ${table("wallet_transactions")} tx on tx.id=topup.wallet_transaction_id and tx.agency_id=topup.agency_id and tx.type='CREDIT' and tx.currency='DZD' where topup.agency_id=${options.agencyId} and (topup.id=${notifications.topupRequestId} or (${notifications.type}='WALLET_TOPUP_DECIDED' and topup.reference=substring(${notifications.body} from '^Request (TOP-[0-9]{4}-[0-9]+) was '))) limit 1)` : sql<string|null>`null`,
      ledgerAmount: options.financial ? sql<string|null>`(select tx.amount::text from ${table("wallet_transactions")} tx where tx.agency_id=${options.agencyId} and ${notifications.type}='WALLET_ADJUSTED' and tx.reference=substring(${notifications.body} from 'Reference (WLT-[0-9]{4}-[0-9]+)[.]$') and tx.currency='DZD' limit 1)` : sql<string|null>`null`,
      ledgerType: options.financial ? sql<string|null>`(select tx.type from ${table("wallet_transactions")} tx where tx.agency_id=${options.agencyId} and ${notifications.type}='WALLET_ADJUSTED' and tx.reference=substring(${notifications.body} from 'Reference (WLT-[0-9]{4}-[0-9]+)[.]$') limit 1)` : sql<string|null>`null`,
      ledgerReference: options.financial ? sql<string|null>`(select tx.reference from ${table("wallet_transactions")} tx where tx.agency_id=${options.agencyId} and ${notifications.type}='WALLET_ADJUSTED' and tx.reference=substring(${notifications.body} from 'Reference (WLT-[0-9]{4}-[0-9]+)[.]$') limit 1)` : sql<string|null>`null`,
      resolvedTopupId: options.financial ? sql<string|null>`(select topup.id::text from ${table("wallet_topup_requests")} topup where topup.agency_id=${options.agencyId} and (topup.id=${notifications.topupRequestId} or (${notifications.type}='WALLET_TOPUP_DECIDED' and topup.reference=substring(${notifications.body} from '^Request (TOP-[0-9]{4}-[0-9]+) was '))) limit 1)` : sql<string|null>`null`,
      ledgerDirection: options.financial ? sql<string|null>`(select case when tx.balance_after>tx.balance_before then 'in' when tx.balance_after<tx.balance_before then 'out' else null end from ${table("wallet_transactions")} tx where tx.agency_id=${options.agencyId} and ${notifications.type}='WALLET_ADJUSTED' and tx.reference=substring(${notifications.body} from 'Reference (WLT-[0-9]{4}-[0-9]+)[.] options.financial ? sql<string|null>`(select tx.id::text from ${table("wallet_transactions")} tx where tx.agency_id=${options.agencyId} and ${notifications.type}='WALLET_ADJUSTED' and tx.reference=substring(${notifications.body} from 'Reference (WLT-[0-9]{4}-[0-9]+)[.]$') and tx.currency='DZD' limit 1)` : sql<string|null>`null`,
      travellerName: sql<string | null>`(select coalesce(traveller.full_name, concat_ws(' ',traveller.first_name,traveller.last_name)) from ${table("applicants")} traveller where traveller.application_id = ${table("notifications")}.application_id limit 1)`,
      destination: applications.countryName,
      countryIso2: countries.iso2,
      visaName: applications.visaTypeName,
      // Match the immutable snapshot before using today's catalogue translation.
      // This mirrors applicationSelection and avoids relabelling an old programme
      // with a materially different name after an administrator renames it.
      visaNameFr: sql<string | null>`case when ${visaTypes.name} = ${applications.visaTypeName} then ${visaTypes.nameFr} else null end`,
      visaNameAr: sql<string | null>`case when ${visaTypes.name} = ${applications.visaTypeName} then ${visaTypes.nameAr} else null end`,
      reference: applications.reference,
      agencyName: sql<string | null>`(select coalesce(agency.trading_name,agency.legal_name) from ${table("agencies")} agency where agency.id = ${notifications.agencyId})`,
    })
    .from(notifications)
    .leftJoin(applications, eq(notifications.applicationId, applications.id))
    .leftJoin(countries, eq(applications.countryId, countries.id))
    .leftJoin(visaTypes, eq(applications.visaTypeId, visaTypes.id))
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt),desc(notifications.id));
  if(options.groupPage)return selection;
  return selection.limit(Number.isFinite(limit)?Math.min(100,Math.max(1,Math.floor(limit))):50).offset(options?Math.max(0,Math.min(100000,Math.floor(options.offset??0))):0);
}

) and tx.currency='DZD' limit 1)` : sql<string|null>`null`,
      ledgerId: options.financial ? sql<string|null>`(select tx.id::text from ${table("wallet_transactions")} tx where tx.agency_id=${options.agencyId} and ${notifications.type}='WALLET_ADJUSTED' and tx.reference=substring(${notifications.body} from 'Reference (WLT-[0-9]{4}-[0-9]+)[.]$') and tx.currency='DZD' limit 1)` : sql<string|null>`null`,
      travellerName: sql<string | null>`(select coalesce(traveller.full_name, concat_ws(' ',traveller.first_name,traveller.last_name)) from ${table("applicants")} traveller where traveller.application_id = ${table("notifications")}.application_id limit 1)`,
      destination: applications.countryName,
      countryIso2: countries.iso2,
      visaName: applications.visaTypeName,
      // Match the immutable snapshot before using today's catalogue translation.
      // This mirrors applicationSelection and avoids relabelling an old programme
      // with a materially different name after an administrator renames it.
      visaNameFr: sql<string | null>`case when ${visaTypes.name} = ${applications.visaTypeName} then ${visaTypes.nameFr} else null end`,
      visaNameAr: sql<string | null>`case when ${visaTypes.name} = ${applications.visaTypeName} then ${visaTypes.nameAr} else null end`,
      reference: applications.reference,
      agencyName: sql<string | null>`(select coalesce(agency.trading_name,agency.legal_name) from ${table("agencies")} agency where agency.id = ${notifications.agencyId})`,
    })
    .from(notifications)
    .leftJoin(applications, eq(notifications.applicationId, applications.id))
    .leftJoin(countries, eq(applications.countryId, countries.id))
    .leftJoin(visaTypes, eq(applications.visaTypeId, visaTypes.id))
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt),desc(notifications.id));
  if(options.groupPage)return selection;
  return selection.limit(Number.isFinite(limit)?Math.min(100,Math.max(1,Math.floor(limit))):50).offset(options?Math.max(0,Math.min(100000,Math.floor(options.offset??0))):0);
}

