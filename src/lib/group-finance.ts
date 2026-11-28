import "server-only";
import {pool} from "@/lib/db";
import {qualifiedTable as qt} from "@/lib/database-schema";
import {hasPermission} from "@/lib/rbac";
import {groupEnabled} from "@/lib/group-policy";
import {type AuthUser,isAgencyRole,isStaffRole} from "@/lib/types";
export type GroupFinance={group_id:string;application_id:string;charged:string;surcharge:string;discount:string;refund:string;net:string;valid:boolean};
/** Read actual immutable wallet entries, not estimated/current catalogue prices. */
export async function readGroupFinance(user:AuthUser,ids:string[]){
 const staff=isStaffRole(user.role)&&!user.agencyId&&hasPermission(user,"transactions.view.all"),agency=isAgencyRole(user.role)&&user.agencyId&&user.agencyStatus==="ACTIVE"&&hasPermission(user,"transactions.view.own");
 if(!groupEnabled()||user.userStatus!=="ACTIVE"||user.mustChangePassword||user.mfaPending||(!staff&&!agency)||!ids.length)return [];
 const r=await pool.query<GroupFinance>(`select g.id group_id,a.id application_id,
 coalesce(sum(w.amount) filter(where w.type='APPLICATION_CHARGE'),0)::text charged,
 coalesce(sum(w.amount) filter(where w.type='COMMERCIAL_SURCHARGE'),0)::text surcharge,
 coalesce(sum(w.amount) filter(where w.type='COMMERCIAL_DISCOUNT' and p.type='DISCOUNT'),0)::text discount,
 coalesce(sum(w.amount) filter(where w.type='COMMERCIAL_DISCOUNT' and p.type='REFUND'),0)::text refund,
 coalesce(sum(w.balance_before-w.balance_after),0)::text net,
 (count(w.id) filter(where w.type='APPLICATION_CHARGE')=1 and count(w.id)=count(distinct w.id) and count(w.id) filter(where w.agency_id<>a.agency_id or w.currency<>'DZD' or w.type not in ('APPLICATION_CHARGE','COMMERCIAL_DISCOUNT','COMMERCIAL_SURCHARGE') or (w.type='COMMERCIAL_DISCOUNT' and (p.type is null or p.type not in ('DISCOUNT','REFUND') or p.currency<>'DZD' or p.amount<>w.amount)) or (w.type='COMMERCIAL_SURCHARGE' and (p.type is distinct from 'SURCHARGE' or p.currency<>'DZD' or p.amount<>w.amount)))=0) valid
 from ${qt("visa_request_groups")} g join ${qt("visa_request_group_members")} m on m.group_id=g.id and m.agency_id=g.agency_id join ${qt("applications")} a on a.id=m.application_id and a.agency_id=g.agency_id
 left join ${qt("wallet_transactions")} w on w.application_id=a.id
 left join ${qt("application_price_adjustments")} p on p.wallet_transaction_id=w.id and p.application_id=a.id
 where g.id=any($1::uuid[]) and ($2::uuid is null or g.agency_id=$2) group by g.id,a.id`,[ids.slice(0,30),staff?null:user.agencyId]);
 return r.rows;
}
