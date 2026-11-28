-- Explicit Preview only. Never run against visa_os or public.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table visa_os_preview.saved_traveller_groups (
 agency_id uuid not null references visa_os_preview.agencies(id) on delete cascade,
 id uuid not null,
 label text not null check(char_length(btrim(label)) between 1 and 40),
 profiles uuid[] not null check(cardinality(profiles) between 2 and 5 and array_position(profiles,null) is null),
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(agency_id,id)
);
alter table visa_os_preview.saved_traveller_groups enable row level security;
revoke all on visa_os_preview.saved_traveller_groups from public,anon,authenticated,service_role;
commit;
