-- Explicit, additive Preview-only group metadata. Never run in the build.
begin;
set local lock_timeout='5s';
create unique index if not exists group_application_scope_uq on visa_os_preview.applications(agency_id,id);
create table if not exists visa_os_preview.visa_request_groups (
 id uuid not null, agency_id uuid not null references visa_os_preview.agencies(id), created_by uuid not null references visa_os_preview.users(id),
 manifest text not null check(manifest ~ '^[a-f0-9]{64}$'), member_count integer not null check(member_count between 2 and 5),
 created_at timestamptz not null default now(), primary key(agency_id,id)
);
create table if not exists visa_os_preview.visa_request_group_members (
 agency_id uuid not null, group_id uuid not null, application_id uuid not null, position integer not null check(position between 1 and 5),
 primary key(agency_id,group_id,position), unique(application_id),
 foreign key(agency_id,group_id) references visa_os_preview.visa_request_groups(agency_id,id) on delete cascade,
 foreign key(agency_id,application_id) references visa_os_preview.applications(agency_id,id) on delete cascade
);
alter table visa_os_preview.visa_request_groups enable row level security;
alter table visa_os_preview.visa_request_group_members enable row level security;
revoke all on visa_os_preview.visa_request_groups,visa_os_preview.visa_request_group_members from public,anon,authenticated,service_role;
commit;
