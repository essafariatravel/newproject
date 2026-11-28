-- Consolidated Preview only: declared visa dates and deduplicated in-app reminders.
begin;
set local lock_timeout='5s';
create table if not exists visa_os_preview.traveller_visa_dates (
 document_id uuid primary key references visa_os_preview.documents(id) on delete cascade,
 agency_id uuid not null,
 profile_id uuid not null,
 valid_from date not null,
 valid_until date not null check(valid_until>=valid_from),
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now(),
 foreign key(agency_id,profile_id) references visa_os_preview.traveller_profiles(agency_id,id) on delete cascade
);
create index if not exists traveller_visa_dates_due_idx on visa_os_preview.traveller_visa_dates(agency_id,valid_until);
create table if not exists visa_os_preview.traveller_visa_renewal_events (
 user_id uuid not null references visa_os_preview.users(id) on delete cascade,
 document_id uuid not null references visa_os_preview.traveller_visa_dates(document_id) on delete cascade,
 expiry date not null,
 stage text not null check(stage in ('URGENT','EXPIRED')),
 notification_id uuid not null unique default gen_random_uuid(),
 created_at timestamptz not null default now(),
 primary key(user_id,document_id,expiry,stage)
);
alter table visa_os_preview.traveller_visa_dates enable row level security;
alter table visa_os_preview.traveller_visa_renewal_events enable row level security;
revoke all on visa_os_preview.traveller_visa_dates,visa_os_preview.traveller_visa_renewal_events from public,anon,authenticated,service_role;
commit;
