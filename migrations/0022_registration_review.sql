-- Initial contact no longer requires administrative profiling.
alter table agency_registrations alter column country drop not null;
alter table agency_registrations alter column city drop not null;
alter table agency_registrations alter column address_line drop not null;
alter table agency_registrations alter column commercial_registration_number drop not null;
alter table agency_registrations alter column contact_position drop not null;

create table agency_registration_requests (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references agency_registrations(id),
  category text not null check (category in ('COMMERCIAL_REGISTRATION','AGENCY_LICENCE','TAX_DOCUMENT','OTHER')),
  label text not null check (char_length(label) between 2 and 160),
  note text not null,
  status text not null default 'OPEN' check (status in ('OPEN','RECEIVED','CANCELLED')),
  document_id uuid references agency_registration_documents(id),
  requested_by uuid not null references users(id),
  received_at timestamptz,
  created_at timestamptz not null default now(),
  constraint agency_registration_request_receipt_check check ((status = 'RECEIVED') = (document_id is not null))
);
create index agency_registration_requests_reg_idx on agency_registration_requests(registration_id);
create table agency_registration_followup_tokens (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references agency_registrations(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);
create index agency_registration_followup_tokens_reg_idx on agency_registration_followup_tokens(registration_id);
