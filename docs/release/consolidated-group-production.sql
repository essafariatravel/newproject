-- Approved consolidated Production release; additive schema and conservative profile backfill only.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create table if not exists visa_os.traveller_profiles (
 id uuid primary key default gen_random_uuid(),
 agency_id uuid not null references visa_os.agencies(id) on delete cascade,
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
create table if not exists visa_os.traveller_profile_links (
 applicant_id uuid primary key references visa_os.applicants(id) on delete cascade,
 agency_id uuid not null,
 profile_id uuid not null,
 created_at timestamptz not null default now(),
 foreign key(agency_id,profile_id) references visa_os.traveller_profiles(agency_id,id) on delete cascade
);
create index if not exists traveller_profiles_agency_expiry_idx on visa_os.traveller_profiles(agency_id,passport_expiry);
create index if not exists traveller_links_profile_idx on visa_os.traveller_profile_links(agency_id,profile_id);
create table if not exists visa_os.traveller_renewal_events (
 user_id uuid not null references visa_os.users(id) on delete cascade,
 agency_id uuid not null,
 profile_id uuid not null,
 expiry date not null,
 stage text not null check(stage in ('RENEW','URGENT','EXPIRED')),
 notification_id uuid not null unique default gen_random_uuid(),
 created_at timestamptz not null default now(),
 primary key(user_id,profile_id,expiry,stage),
 foreign key(agency_id,profile_id) references visa_os.traveller_profiles(agency_id,id) on delete cascade
);
create table if not exists visa_os.traveller_renewal_scan (
 user_id uuid primary key references visa_os.users(id) on delete cascade,
 scanned_at timestamptz not null
);
alter table visa_os.traveller_profiles enable row level security;
alter table visa_os.traveller_profile_links enable row level security;
alter table visa_os.traveller_renewal_events enable row level security;
alter table visa_os.traveller_renewal_scan enable row level security;
revoke all on visa_os.traveller_profiles,visa_os.traveller_profile_links,visa_os.traveller_renewal_events,visa_os.traveller_renewal_scan from public,anon,authenticated,service_role;
create temporary table th_backfill on commit drop as
with raw as (
 select t.id,a.agency_id,left(coalesce(nullif(trim(t.full_name),''),nullif(trim(concat_ws(' ',t.first_name,t.middle_name,t.last_name)),''),'—'),200) full_name,
 left(coalesce(nullif(upper(trim(t.nationality)),''),'—'),80) nationality,
 nullif(upper(trim(t.passport_number)),'' ) passport_number,t.passport_expiry_date,t.date_of_birth,t.created_at,t.updated_at
 from visa_os.applicants t join visa_os.applications a on a.id=t.application_id join visa_os.statuses s on s.id=a.status_id where not s.is_draft and not exists(select 1 from visa_os.traveller_profile_links l where l.applicant_id=t.id)
), keyed as (
 select *,case when passport_number ~ '^[A-Z0-9]{6,20}$' and passport_number ~ '[0-9]' and passport_number !~ '^([A-Z0-9])\1+$' and full_name<>'—' and nationality<>'—' and (passport_expiry_date is not null or date_of_birth is not null)
 then jsonb_build_array(passport_number,nationality,lower(regexp_replace(trim(full_name),'[[:space:]]+',' ','g')),date_of_birth,passport_expiry_date)::text else id::text end identity_key from raw
)
select *,first_value(id) over(partition by agency_id,identity_key order by created_at,id) profile_id from keyed;
insert into visa_os.traveller_profiles(id,agency_id,full_name,nationality,passport_number,passport_expiry,date_of_birth,created_at,updated_at)
select id,agency_id,full_name,nationality,passport_number,passport_expiry_date,date_of_birth,created_at,updated_at from th_backfill where id=profile_id on conflict(id) do nothing;
insert into visa_os.traveller_profile_links(applicant_id,agency_id,profile_id)
select b.id,b.agency_id,b.profile_id from th_backfill b join visa_os.traveller_profiles p on p.id=b.profile_id and p.agency_id=b.agency_id on conflict(applicant_id) do nothing;

create table if not exists visa_os.traveller_vault_files (
 id uuid primary key default gen_random_uuid(),
 agency_id uuid not null,
 profile_id uuid not null,
 type_id uuid not null references visa_os.document_types(id),
 version integer not null check(version>0),
 original_filename text not null check(length(original_filename) between 1 and 240),
 mime_type text not null,
 size_bytes integer not null check(size_bytes between 1 and 2097152),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 data bytea not null check(octet_length(data)=size_bytes),
 issued_at date,
 identity_name text not null,
 identity_nationality text not null,
 identity_passport text not null,
 identity_expiry date not null,
 created_at timestamptz not null default now(),
 foreign key(agency_id,profile_id) references visa_os.traveller_profiles(agency_id,id) on delete cascade,
 unique(profile_id,type_id,version)
);
create index if not exists traveller_vault_lookup_idx on visa_os.traveller_vault_files(agency_id,profile_id,type_id,version desc);
alter table visa_os.traveller_vault_files enable row level security;
revoke all on visa_os.traveller_vault_files from public,anon,authenticated,service_role;

alter table visa_os.traveller_profiles add column if not exists archived_at timestamptz;
alter table visa_os.traveller_profiles add column if not exists merged_into uuid;
alter table visa_os.traveller_profiles add constraint traveller_profile_merge_scope foreign key(agency_id,merged_into) references visa_os.traveller_profiles(agency_id,id);
alter table visa_os.traveller_profiles add constraint traveller_profile_merge_state check(merged_into is null or (merged_into<>id and archived_at is not null));
create index if not exists traveller_active_profiles_idx on visa_os.traveller_profiles(agency_id,archived_at,updated_at);

create table if not exists visa_os.traveller_visa_dates (
 document_id uuid primary key references visa_os.documents(id) on delete cascade,
 agency_id uuid not null,
 profile_id uuid not null,
 valid_from date not null,
 valid_until date not null check(valid_until>=valid_from),
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now(),
 foreign key(agency_id,profile_id) references visa_os.traveller_profiles(agency_id,id) on delete cascade
);
create index if not exists traveller_visa_dates_due_idx on visa_os.traveller_visa_dates(agency_id,valid_until);
create table if not exists visa_os.traveller_visa_renewal_events (
 user_id uuid not null references visa_os.users(id) on delete cascade,
 document_id uuid not null references visa_os.traveller_visa_dates(document_id) on delete cascade,
 expiry date not null,
 stage text not null check(stage in ('URGENT','EXPIRED')),
 notification_id uuid not null unique default gen_random_uuid(),
 created_at timestamptz not null default now(),
 primary key(user_id,document_id,expiry,stage)
);
alter table visa_os.traveller_visa_dates enable row level security;
alter table visa_os.traveller_visa_renewal_events enable row level security;
revoke all on visa_os.traveller_visa_dates,visa_os.traveller_visa_renewal_events from public,anon,authenticated,service_role;

create unique index if not exists group_application_scope_uq on visa_os.applications(agency_id,id);
create table if not exists visa_os.visa_request_groups (
 id uuid not null, agency_id uuid not null references visa_os.agencies(id) on delete cascade, created_by uuid references visa_os.users(id) on delete set null,
 manifest text not null check(manifest ~ '^[a-f0-9]{64}$'), member_count integer not null check(member_count between 2 and 5),
 created_at timestamptz not null default now(), primary key(agency_id,id)
);
create table if not exists visa_os.visa_request_group_members (
 agency_id uuid not null, group_id uuid not null, application_id uuid not null, position integer not null check(position between 1 and 5),
 primary key(agency_id,group_id,position), unique(application_id),
 foreign key(agency_id,group_id) references visa_os.visa_request_groups(agency_id,id) on delete cascade,
 foreign key(agency_id,application_id) references visa_os.applications(agency_id,id) on delete cascade
);
alter table visa_os.visa_request_groups enable row level security;
alter table visa_os.visa_request_group_members enable row level security;
revoke all on visa_os.visa_request_groups,visa_os.visa_request_group_members from public,anon,authenticated,service_role;

create table visa_os.saved_traveller_groups (
 agency_id uuid not null references visa_os.agencies(id) on delete cascade,
 id uuid not null,
 label text not null check(char_length(btrim(label)) between 1 and 40),
 profiles uuid[] not null check(cardinality(profiles) between 2 and 5 and array_position(profiles,null) is null),
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(agency_id,id)
);
alter table visa_os.saved_traveller_groups enable row level security;
revoke all on visa_os.saved_traveller_groups from public,anon,authenticated,service_role;

create unique index if not exists visa_request_groups_id_global_uq on visa_os.visa_request_groups(id);
commit;
