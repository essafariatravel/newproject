import "server-only";
import {pool} from "@/lib/db";
import {qualifiedTable as qt} from "@/lib/database-schema";
import {hubEnabled,minimumExpiry,vaultEnabled} from "./traveller-hub-policy";
import {algeriaToday} from "./travel-deadline";
import type {AuthUser} from "./types";
/** Owner-only, one bounded scan per hour, atomic event+notification insertion. No external delivery. */
export async function refreshTravellerRenewals(user:AuthUser){
 if(!hubEnabled()||user.role!=="AGENCY_ADMIN"||!user.agencyId||user.mustChangePassword)return;
 const today=algeriaToday(),min=minimumExpiry(today);
 await pool.query(`with recipient as (
 select u.id,u.agency_id from ${qt("users")} u join ${qt("agencies")} a on a.id=u.agency_id and a.status='ACTIVE'
 where u.id=$1::uuid and u.agency_id=$2::uuid and u.role='AGENCY_ADMIN' and u.status='ACTIVE' and not u.activation_pending and not u.must_change_password
 ), scan as (
 insert into ${qt("traveller_renewal_scan")} as existing(user_id,scanned_at) select id,now() from recipient
 on conflict(user_id) do update set scanned_at=excluded.scanned_at where existing.scanned_at<now()-interval '1 hour' returning user_id
 ), due as (
 select r.id user_id,p.agency_id,p.id profile_id,p.passport_expiry expiry,
 case when p.passport_expiry<=$3::date then 'EXPIRED' when p.passport_expiry<=$3::date+30 then 'URGENT' else 'RENEW' end stage
 from scan join recipient r on r.id=scan.user_id join ${qt("traveller_profiles")} p on p.agency_id=r.agency_id where p.passport_expiry<$4::date ${vaultEnabled()?"and p.archived_at is null":""}
 ), new_events as (
 insert into ${qt("traveller_renewal_events")}(user_id,agency_id,profile_id,expiry,stage)
 select d.user_id,d.agency_id,d.profile_id,d.expiry,d.stage from due d where not exists(select 1 from ${qt("traveller_renewal_events")} e where e.user_id=d.user_id and e.profile_id=d.profile_id and e.expiry=d.expiry and e.stage=d.stage) order by d.expiry,d.profile_id limit 100 on conflict do nothing returning *
 )
 insert into ${qt("notifications")}(id,user_id,agency_id,type,title,body,link)
 select e.notification_id,e.user_id,e.agency_id,'TRAVELLER_PASSPORT_'||e.stage,'Traveller passport reminder',e.expiry::text,'/portal/applicants/'||e.profile_id::text from new_events e`,[user.id,user.agencyId,today,min]);
}
export async function safeTravellerRenewals(user:AuthUser){try{await refreshTravellerRenewals(user)}catch{console.warn("[traveller-hub] Renewal scan unavailable")}}
