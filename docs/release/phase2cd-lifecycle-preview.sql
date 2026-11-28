-- Consolidated Preview: non-destructive lifecycle.
begin;
set local lock_timeout='5s';
alter table visa_os_preview.traveller_profiles add column if not exists archived_at timestamptz;
alter table visa_os_preview.traveller_profiles add column if not exists merged_into uuid;
alter table visa_os_preview.traveller_profiles add constraint traveller_profile_merge_scope foreign key(agency_id,merged_into) references visa_os_preview.traveller_profiles(agency_id,id);
alter table visa_os_preview.traveller_profiles add constraint traveller_profile_merge_state check(merged_into is null or (merged_into<>id and archived_at is not null));
create index if not exists traveller_active_profiles_idx on visa_os_preview.traveller_profiles(agency_id,archived_at,updated_at);
commit;
