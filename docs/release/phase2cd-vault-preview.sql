-- Additive, consolidated Preview only.
begin;
set local lock_timeout='5s';
create table if not exists visa_os_preview.traveller_vault_files (
 id uuid primary key default gen_random_uuid(),
 agency_id uuid not null,
 profile_id uuid not null,
 type_id uuid not null references visa_os_preview.document_types(id),
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
 foreign key(agency_id,profile_id) references visa_os_preview.traveller_profiles(agency_id,id) on delete cascade,
 unique(profile_id,type_id,version)
);
create index if not exists traveller_vault_lookup_idx on visa_os_preview.traveller_vault_files(agency_id,profile_id,type_id,version desc);
alter table visa_os_preview.traveller_vault_files enable row level security;
revoke all on visa_os_preview.traveller_vault_files from public,anon,authenticated,service_role;
commit;
