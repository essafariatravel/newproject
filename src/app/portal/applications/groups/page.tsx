import Link from "next/link";
import {notFound} from "next/navigation";
import {portalPageUser} from "@/lib/page-auth";
import {getUiLocale} from "@/lib/ui-i18n";
import {hasPermission} from "@/lib/rbac";
import {pool} from "@/lib/db";
import {qualifiedTable as qt} from "@/lib/database-schema";
import {groupEnabled} from "@/lib/group-policy";
import {groupCopy} from "@/lib/group-copy";
import {formatDate} from "@/lib/format";
import {businessLabel} from "@/lib/business-labels";
export const dynamic="force-dynamic";
export default async function GroupsPage(){
 if(!groupEnabled())notFound();const user=await portalPageUser();if(!hasPermission(user,"applications.view.all"))notFound();const locale=await getUiLocale(),t=groupCopy[locale];
 const r=await pool.query<{group_id:string;created_at:Date;member_count:number;id:string;reference:string;name:string;country_name:string;status:string;fee:string}>(`with recent as (select id,agency_id,created_at,member_count from ${qt("visa_request_groups")} where agency_id=$1 order by created_at desc,id desc limit 30) select g.id group_id,g.created_at,g.member_count,a.id,a.reference,coalesce(t.full_name,'') name,a.country_name,s.code status,a.submitted_price::text fee from recent g join ${qt("visa_request_group_members")} m on m.group_id=g.id and m.agency_id=g.agency_id join ${qt("applications")} a on a.id=m.application_id and a.agency_id=m.agency_id join ${qt("statuses")} s on s.id=a.status_id left join ${qt("applicants")} t on t.application_id=a.id order by g.created_at desc,g.id desc,m.position`,[user.agencyId]);
 const groups=new Map<string,typeof r.rows>();for(const row of r.rows)groups.set(row.group_id,[...(groups.get(row.group_id)??[]),row]);
 return <section className="group-wizard"><header className="group-heading"><h1>{t.history}</h1><Link className="btn-primary" href="/portal/applications/new?mode=group">{t.group} →</Link></header>{!groups.size?<p>{t.none}</p>:Array.from(groups.entries()).map(([id,rows])=><section key={id} className="group-list"><div className="group-heading"><h2>{rows[0]!.country_name} · {rows.length}/{rows[0]!.member_count} {t.members}</h2><small>{formatDate(rows[0]!.created_at,locale)}</small></div>{rows.map(m=><div className="group-review-row" key={m.id}><div><strong>{m.name}</strong><small><bdi>{m.reference}</bdi> · {businessLabel(m.status,locale)}</small></div><Link className="booking-link" href={"/portal/applications/"+m.id}>{t.open} →</Link></div>)}</section>)}</section>
}
