import "server-only";
import {pool} from "@/lib/db";
import {qualifiedTable as qt} from "@/lib/database-schema";
import {hasPermission} from "@/lib/rbac";
import {isAgencyRole,type AuthUser} from "@/lib/types";
import {uuid,passportKey,normalizedQuery,pageNumber,minimumExpiry,reusableDocument,tripSpecificDocument,hubEnabled,nameKey,type ReuseFile} from "./traveller-hub-policy";
import {vaultOptions,vaultList} from "./traveller-vault";
import {autoEligible,vaultEnabled} from "./traveller-hub-policy";
import {algeriaToday} from "./travel-deadline";
export type Actor=AuthUser&{agencyId:string};
export function scope(user:Actor){if(!hubEnabled()||!isAgencyRole(user.role)||!uuid(user.agencyId)||user.userStatus!=="ACTIVE"||user.agencyStatus!=="ACTIVE"||user.mustChangePassword||!hasPermission(user,"applicants.view.all"))throw Error("Traveller access denied");return user.agencyId}
export type TravellerRow={id:string;application_id:string;reference:string;country_name:string;visa_type_name:string;country_id:string;visa_type_id:string;status_code:string;status_name:string;activity_at:Date;name:string;nationality:string;passport:string;expiry:string|null;dob:string|null;case_count:number;version:number;archived_at?:Date|null;merged_into?:string|null};
const linkedCases=()=>`from ${qt("traveller_profile_links")} l join ${qt("applicants")} t on t.id=l.applicant_id join ${qt("applications")} a on a.id=t.application_id and a.agency_id=l.agency_id join ${qt("statuses")} s on s.id=a.status_id where l.agency_id=$1::uuid and not s.is_draft`;
const profileView=()=>`select p.id,p.full_name name,p.nationality,coalesce(p.passport_number,'') passport,p.passport_expiry::text expiry,p.date_of_birth::text dob,p.version,${vaultEnabled()?`p.archived_at,p.merged_into`:`null::timestamptz archived_at,null::uuid merged_into`},coalesce(latest.application_id::text,'') application_id,coalesce(latest.reference,'—') reference,coalesce(latest.country_name,'') country_name,coalesce(latest.visa_type_name,'') visa_type_name,coalesce(latest.country_id::text,'') country_id,coalesce(latest.visa_type_id::text,'') visa_type_id,coalesce(latest.status_code,'') status_code,coalesce(latest.status_name,'') status_name,coalesce(latest.activity_at,p.created_at) activity_at,coalesce(latest.case_count,0)::int case_count
 from ${qt("traveller_profiles")} p join ${qt("agencies")} g on g.id=p.agency_id and g.status='ACTIVE'
 left join lateral (select a.id application_id,a.reference,a.country_name,a.visa_type_name,a.country_id,a.visa_type_id,s.code status_code,s.name status_name,coalesce(a.submitted_at,a.created_at) activity_at,count(*) over()::int case_count ${linkedCases()} and l.profile_id=p.id order by activity_at desc,t.id desc limit 1) latest on true where p.agency_id=$1::uuid`;
export async function directory(user:Actor,q:unknown,page:unknown,filter:unknown){
 const agency=scope(user),term=normalizedQuery(q),p=pageNumber(page),f=filter==="renew"||filter==="unknown"||vaultEnabled()&&filter==="archived"?filter:"all",minimum=minimumExpiry(algeriaToday())!;
 const result=await pool.query<TravellerRow&{total:number}>(`with profiles as (${profileView()})
 select *,count(*) over()::int total from profiles where (strpos(lower(name),lower($2))>0 or strpos(lower(passport),lower($2))>0 or strpos(lower(reference),lower($2))>0 or exists(select 1 ${linkedCases()} and l.profile_id=profiles.id and strpos(lower(a.reference),lower($2))>0)) and (($3='archived' and archived_at is not null) or (archived_at is null and ($3='all' or ($3='renew' and expiry is not null and expiry<$4) or ($3='unknown' and expiry is null)))) order by activity_at desc,id desc limit 21 offset $5`,[agency,term,f,minimum,(p-1)*20]);
 return {rows:result.rows.slice(0,20),hasNext:result.rows.length>20,page:p,q:term,filter:f,total:result.rows[0]?.total??0};
}
export async function travellerProfile(user:Actor,id:string){
 const agency=scope(user);if(!uuid(id))return null;
 const found=await pool.query<TravellerRow>(profileView()+` and (p.id=$2::uuid or exists(select 1 from ${qt("traveller_profile_links")} l where l.agency_id=$1::uuid and l.profile_id=p.id and l.applicant_id=$2::uuid)) order by (p.id=$2::uuid) desc limit 1`,[agency,id]);
 const anchor=found.rows[0];if(!anchor)return null;
 const history=await pool.query<TravellerRow>(`select t.id,a.id application_id,a.reference,a.country_name,a.visa_type_name,a.country_id,a.visa_type_id,s.code status_code,s.name status_name,coalesce(a.submitted_at,a.created_at) activity_at,coalesce(nullif(t.full_name,''),concat_ws(' ',t.first_name,t.middle_name,t.last_name)) name,t.nationality,coalesce(t.passport_number,'') passport,t.passport_expiry_date::text expiry,t.date_of_birth::text dob,0 case_count,0 version ${linkedCases()} and l.profile_id=$2::uuid order by activity_at desc,t.id desc limit 100`,[agency,anchor.id]);
 const candidates=await pool.query<Pick<TravellerRow,"id"|"name"|"reference"|"activity_at"|"passport"|"expiry"|"dob"|"nationality"|"version">>(`select id,name,reference,activity_at,passport,expiry,dob,nationality,version from (${profileView()}) v where archived_at is null and id<>$2::uuid and lower(regexp_replace(trim(name),'[[:space:]]+',' ','g'))=$3 and nationality=$4 order by activity_at desc,id desc limit 10`,[agency,anchor.id,nameKey(anchor.name),anchor.nationality]);
 return {anchor,latest:history.rows[0]??null,history:history.rows,candidates:candidates.rows};
}
type DocRow={id:string;type_id:string;code:string;label:string;filename:string;mime:string;size:number;sha256:string|null;status:string;reference:string;created_at:Date;expiry:string|null;passport:string;name:string;nationality:string;programme_id:string;latest:boolean;open_request:boolean};
export async function travellerDocuments(user:Actor,profile:NonNullable<Awaited<ReturnType<typeof travellerProfile>>>){
 const agency=scope(user);if(!hasPermission(user,"documents.view.all"))return [];

 const r=await pool.query<DocRow>(`select d.id,d.document_type_id type_id,dt.code,dt.name label,d.original_filename filename,d.mime_type mime,d.size_bytes size,d.sha256,d.status,a.reference,d.created_at,t.passport_expiry_date::text expiry,t.passport_number passport,coalesce(nullif(t.full_name,''),concat_ws(' ',t.first_name,t.middle_name,t.last_name)) name,t.nationality,a.visa_type_id programme_id,
 not exists(select 1 from ${qt("documents")} newer where newer.application_id=d.application_id and newer.document_type_id=d.document_type_id and (newer.version,newer.created_at,newer.id)>(d.version,d.created_at,d.id)) latest,
 exists(select 1 from ${qt("document_requests")} rq where rq.application_id=a.id and rq.status='OPEN' and (rq.document_type_id=d.document_type_id or rq.checklist_item_id=d.checklist_item_id)) open_request
 from ${qt("documents")} d join ${qt("applications")} a on a.id=d.application_id
 join ${qt("agencies")} g on g.id=a.agency_id and g.status='ACTIVE'
 join ${qt("applicants")} t on t.application_id=a.id
 join ${qt("traveller_profile_links")} l on l.applicant_id=t.id and l.agency_id=a.agency_id and l.profile_id=$2::uuid
 join ${qt("document_types")} dt on dt.id=d.document_type_id
 where a.agency_id=$1::uuid ${vaultEnabled()?"and dt.code not like 'DECISION_%'":""} and not exists(select 1 from ${qt("statuses")} s where s.id=a.status_id and s.is_draft) and (d.applicant_id=t.id or (d.applicant_id is null and (select count(*) from ${qt("applicants")} other where other.application_id=a.id)=1))
 order by d.created_at desc,d.id desc limit 100`,[agency,profile.anchor.id]);
 const today=algeriaToday();
 return r.rows.map(({sha256,passport,expiry,latest,open_request,name,nationality,...d})=>{const identity=Boolean(passportKey(passport)&&passportKey(passport)===passportKey(profile.anchor.passport)&&expiry===profile.anchor.expiry&&nameKey(name)===nameKey(profile.anchor.name)&&nationality.trim().toUpperCase()===profile.anchor.nationality);const auto=Boolean(vaultEnabled()&&identity&&autoEligible({code:d.code,status:d.status,size:d.size,mime:d.mime,sha256,expiry,today,latest,openRequest:open_request,attributable:true,issuedAt:null,uploadedAt:d.created_at.toISOString(),vault:false}));return {...d,automatic:auto,reusable:auto||Boolean(passportKey(passport)&&passportKey(passport)===passportKey(profile.anchor.passport)&&expiry===profile.anchor.expiry&&nameKey(name)===nameKey(profile.anchor.name)&&nationality.trim().toUpperCase()===profile.anchor.nationality&&reusableDocument({code:d.code,status:d.status,size:d.size,mime:d.mime,sha256,expiry,today,latest,openRequest:open_request,attributable:true,uploadedAt:d.created_at.toISOString()}))}});
}
export async function repeatSource(user:Actor,id:string){
 const profile=await travellerProfile(user,id);if(!profile||profile.anchor.archived_at||!hasPermission(user,"applications.create"))return null;
 const a=profile.anchor;
 const documents=hasPermission(user,"documents.upload.own")?await travellerDocuments(user,profile):[];
 const reusable:ReuseFile[]=documents.filter(d=>d.reusable).slice(0,40).map(d=>({id:d.id,typeId:d.type_id,code:d.code,name:d.filename,mime:d.mime,size:d.size,sourceReference:d.reference,createdAt:d.created_at.toISOString(),programmeId:d.programme_id,tripSpecific:tripSpecificDocument(d.code),automatic:d.automatic}));
 if(vaultEnabled()&&hasPermission(user,"documents.upload.own")&&hasPermission(user,"documents.view.all")){const stored=await vaultList(user,a.id);const current=new Set(stored.filter(d=>d.latest).map(d=>d.type_id));const direct=await vaultOptions(user,a.id);return {id:a.id,name:a.name,nationality:a.nationality,passport:passportKey(a.passport),expiry:a.expiry??"",reference:a.reference,reusable:[...direct,...reusable.filter(d=>!current.has(d.typeId))]};}
 return {id:a.id,name:a.name,nationality:a.nationality,passport:passportKey(a.passport),expiry:a.expiry??"",reference:a.reference,reusable};
}
