import "server-only";
import {pool} from "@/lib/db";
import {qualifiedTable as qt} from "@/lib/database-schema";
import {hasPermission} from "@/lib/rbac";
import {isAgencyRole,type AuthUser} from "@/lib/types";
import {uuid,passportKey,normalizedQuery,pageNumber,minimumExpiry,reusablePassport,hubEnabled,type ReuseFile} from "./traveller-hub-policy";
import {algeriaToday} from "./travel-deadline";
type Actor=AuthUser&{agencyId:string};
function scope(user:Actor){if(!hubEnabled()||!isAgencyRole(user.role)||!uuid(user.agencyId)||user.userStatus!=="ACTIVE"||user.agencyStatus!=="ACTIVE"||user.mustChangePassword||!hasPermission(user,"applicants.view.all"))throw Error("Traveller access denied");return user.agencyId}
const cte=()=>`with scoped as (
 select t.id,t.application_id,a.reference,a.country_name,a.visa_type_name,a.country_id,a.visa_type_id,s.code status_code,s.name status_name,
 coalesce(a.submitted_at,a.created_at) activity_at, t.created_at,
 coalesce(nullif(trim(t.full_name),''),concat_ws(' ',nullif(trim(t.first_name),''),nullif(trim(t.middle_name),''),nullif(trim(t.last_name),''))) name,
 upper(trim(t.nationality)) nationality, upper(trim(coalesce(t.passport_number,''))) passport,t.passport_expiry_date::text expiry,t.date_of_birth::text dob
 from ${qt("applicants")} t join ${qt("applications")} a on a.id=t.application_id
 join ${qt("agencies")} g on g.id=a.agency_id and g.status='ACTIVE'
 join ${qt("statuses")} s on s.id=a.status_id
 where a.agency_id=$1::uuid and s.is_draft=false
 ), normalized as (select *,lower(regexp_replace(trim(name),'[[:space:]]+',' ','g')) name_key from scoped),
 keyed as (select *,case when passport ~ '^[A-Z0-9]{6,20}$' and passport ~ '[0-9]' and passport !~ '^([A-Z0-9])\\1+$' and name_key<>'' and nationality<>'' then jsonb_build_array(passport,nationality,name_key,coalesce(dob,''))::text else id::text end identity_key from normalized)`;
export type TravellerRow={id:string;application_id:string;reference:string;country_name:string;visa_type_name:string;country_id:string;visa_type_id:string;status_code:string;status_name:string;activity_at:Date;name:string;nationality:string;passport:string;expiry:string|null;dob:string|null;case_count:number};
export async function directory(user:Actor,q:unknown,page:unknown,filter:unknown){
 const agency=scope(user),term=normalizedQuery(q),p=pageNumber(page),f=filter==="renew"||filter==="unknown"?filter:"all";
 const minimum=minimumExpiry(algeriaToday())!;
 const result=await pool.query<TravellerRow&{total:number}>(cte()+`, grouped as (
 select *,row_number() over(partition by identity_key order by activity_at desc,id desc) rn,count(*) over(partition by identity_key)::int case_count,
 bool_or(strpos(lower(name),lower($2))>0 or strpos(lower(passport),lower($2))>0 or strpos(lower(reference),lower($2))>0) over(partition by identity_key) matches
 from keyed), filtered as (select * from grouped where rn=1 and matches and ($3='all' or ($3='renew' and expiry is not null and expiry<$4) or ($3='unknown' and expiry is null)))
 select id,application_id,reference,country_name,visa_type_name,country_id,visa_type_id,status_code,status_name,activity_at,name,nationality,passport,expiry,dob,case_count,count(*) over()::int total
 from filtered order by activity_at desc,id desc limit 21 offset $5`,[agency,term,f,minimum,(p-1)*20]);
 return {rows:result.rows.slice(0,20),hasNext:result.rows.length>20,page:p,q:term,filter:f,total:result.rows[0]?.total??0};
}
export async function travellerProfile(user:Actor,id:string){
 const agency=scope(user);if(!uuid(id))return null;
 const result=await pool.query<TravellerRow>(cte()+`, target as (select identity_key from keyed where id=$2::uuid)
 select k.*,count(*) over()::int case_count from keyed k join target t using(identity_key) order by (k.id=$2::uuid) desc,activity_at desc,id desc limit 100`,[agency,id]);
 const anchor=result.rows.find(r=>r.id===id);
 if(!result.rows.length)return null;
 // If an older anchor lies outside the 100 most recent results, reject rather than silently changing identity.
 if(!anchor)return null;
 result.rows.sort((a,b)=>b.activity_at.getTime()-a.activity_at.getTime()||b.id.localeCompare(a.id));
 const candidates=await pool.query<Pick<TravellerRow,"id"|"name"|"reference"|"activity_at"|"passport">>(cte()+` select k.id,k.name,k.reference,k.activity_at,k.passport from keyed k join keyed a on a.id=$2::uuid and k.identity_key<>a.identity_key and k.name_key=a.name_key and k.nationality=a.nationality where a.name_key<>'' order by k.activity_at desc,k.id desc limit 10`,[agency,id]);
 return {anchor,latest:result.rows[0]!,history:result.rows,candidates:candidates.rows};
}
type DocRow={id:string;type_id:string;code:string;label:string;filename:string;mime:string;size:number;sha256:string|null;status:string;reference:string;created_at:Date;expiry:string|null;passport:string;latest:boolean;open_request:boolean};
export async function travellerDocuments(user:Actor,profile:NonNullable<Awaited<ReturnType<typeof travellerProfile>>>){
 const agency=scope(user);if(!hasPermission(user,"documents.view.all"))return [];
 const ids=profile.history.map(r=>r.id);
 const r=await pool.query<DocRow>(`select d.id,d.document_type_id type_id,dt.code,dt.name label,d.original_filename filename,d.mime_type mime,d.size_bytes size,d.sha256,d.status,a.reference,d.created_at,t.passport_expiry_date::text expiry,t.passport_number passport,
 not exists(select 1 from ${qt("documents")} newer where newer.application_id=d.application_id and newer.document_type_id=d.document_type_id and (newer.version,newer.created_at,newer.id)>(d.version,d.created_at,d.id)) latest,
 exists(select 1 from ${qt("document_requests")} rq where rq.application_id=a.id and rq.status='OPEN' and (rq.document_type_id=d.document_type_id or rq.checklist_item_id=d.checklist_item_id)) open_request
 from ${qt("documents")} d join ${qt("applications")} a on a.id=d.application_id
 join ${qt("agencies")} g on g.id=a.agency_id and g.status='ACTIVE'
 join ${qt("applicants")} t on t.application_id=a.id and t.id=any($2::uuid[])
 join ${qt("document_types")} dt on dt.id=d.document_type_id
 where a.agency_id=$1::uuid and (d.applicant_id=t.id or (d.applicant_id is null and (select count(*) from ${qt("applicants")} other where other.application_id=a.id)=1))
 order by d.created_at desc,d.id desc limit 100`,[agency,ids]);
 const today=algeriaToday();
 return r.rows.map(({sha256,passport,expiry,latest,open_request,...d})=>({...d,reusable:Boolean(passportKey(passport)&&passportKey(passport)===passportKey(profile.anchor.passport)&&expiry===profile.anchor.expiry&&reusablePassport({code:d.code,status:d.status,size:d.size,mime:d.mime,sha256,expiry,today,latest,openRequest:open_request,attributable:true}))}));
}
export async function repeatSource(user:Actor,id:string){
 const profile=await travellerProfile(user,id);if(!profile||!hasPermission(user,"applications.create"))return null;
 const a=profile.anchor;
 const documents=hasPermission(user,"documents.upload.own")?await travellerDocuments(user,profile):[];
 const reusable:ReuseFile[]=documents.filter(d=>d.reusable).slice(0,5).map(d=>({id:d.id,typeId:d.type_id,code:d.code,name:d.filename,mime:d.mime,size:d.size,sourceReference:d.reference,createdAt:d.created_at.toISOString()}));
 return {id:a.id,name:a.name,nationality:a.nationality,passport:passportKey(a.passport),expiry:a.expiry??"",reference:a.reference,reusable};
}
