-- Explicit Phase II-D Preview only. No production search_path or DDL.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table if not exists visa_os_preview.traveller_profiles (
 id uuid primary key default gen_random_uuid(),
 agency_id uuid not null references visa_os_preview.agencies(id) on delete cascade,
 full_name text not null check(char_length(full_name) between 1 and 200),
 nationality text not null check(char_length(nationality) between 1 and 80),
 passport_number text,
 passport_expiry date,
 date_of_birth date,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(agency_id,id)
);
create table if not exists visa_os_preview.traveller_profile_links (
 applicant_id uuid primary key references visa_os_preview.applicants(id) on delete cascade,
 agency_id uuid not null,
 profile_id uuid not null,
 created_at timestamptz not null default now(),
 foreign key(agency_id,profile_id) references visa_os_preview.traveller_profiles(agency_id,id) on delete cascade
);
create index if not exists traveller_profiles_agency_expiry_idx on visa_os_preview.traveller_profiles(agency_id,passport_expiry);
create index if not exists traveller_links_profile_idx on visa_os_preview.traveller_profile_links(agency_id,profile_id);
create table if not exists visa_os_preview.traveller_renewal_events (
 user_id uuid not null references visa_os_preview.users(id) on delete cascade,
 agency_id uuid not null,
 profile_id uuid not null,
 expiry date not null,
 stage text not null check(stage in ('RENEW','URGENT','EXPIRED')),
 notification_id uuid not null unique default gen_random_uuid(),
 created_at timestamptz not null default now(),
 primary key(user_id,profile_id,expiry,stage),
 foreign key(agency_id,profile_id) references visa_os_preview.traveller_profiles(agency_id,id) on delete cascade
);
create table if not exists visa_os_preview.traveller_renewal_scan (
 user_id uuid primary key references visa_os_preview.users(id) on delete cascade,
 scanned_at timestamptz not null
);
alter table visa_os_preview.traveller_profiles enable row level security;
alter table visa_os_preview.traveller_profile_links enable row level security;
alter table visa_os_preview.traveller_renewal_events enable row level security;
alter table visa_os_preview.traveller_renewal_scan enable row level security;
revoke all on visa_os_preview.traveller_profiles,visa_os_preview.traveller_profile_links,visa_os_preview.traveller_renewal_events,visa_os_preview.traveller_renewal_scan from public,anon,authenticated,service_role;
-- Backfill deliberately one persistent profile per prior applicant; no identity merge.
-- Exact matches can be linked only by explicit future agency action. Historical snapshots unchanged.
insert into visa_os_preview.traveller_profiles(id,agency_id,full_name,nationality,passport_number,passport_expiry,date_of_birth,created_at,updated_at)
select t.id,a.agency_id,left(coalesce(nullif(trim(t.full_name),''),nullif(trim(concat_ws(' ',t.first_name,t.middle_name,t.last_name)),''),'—'),200),
left(coalesce(nullif(upper(trim(t.nationality)),''),'—'),80),nullif(upper(trim(t.passport_number)),''),t.passport_expiry_date,t.date_of_birth,t.created_at,t.updated_at
from visa_os_preview.applicants t join visa_os_preview.applications a on a.id=t.application_id join visa_os_preview.statuses s on s.id=a.status_id
where not s.is_draft on conflict(id) do nothing;
insert into visa_os_preview.traveller_profile_links(applicant_id,agency_id,profile_id)
select t.id,a.agency_id,t.id from visa_os_preview.applicants t join visa_os_preview.applications a on a.id=t.application_id join visa_os_preview.traveller_profiles p on p.id=t.id and p.agency_id=a.agency_id
on conflict(applicant_id) do nothing;
commit;
