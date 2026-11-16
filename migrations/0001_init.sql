-- ESSAFARIA VISA OS — initial schema
-- Hand-authored to match src/db/schema.ts exactly.

create extension if not exists pgcrypto;

-- =============== Tenancy ===============

create table agencies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trading_name text,
  email text not null,
  phone text,
  address_line text,
  city text,
  country text,
  status text not null default 'ACTIVE',
  balance numeric(14,2) not null default 0,
  currency char(3) not null default 'EUR',
  billing_name text,
  billing_email text,
  billing_tax_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agencies_balance_nonnegative check (balance >= 0)
);
create index agencies_status_idx on agencies (status);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  name text not null,
  role text not null,
  agency_id uuid references agencies (id),
  status text not null default 'ACTIVE',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_role_check check (role in ('SUPER_ADMIN','ADMIN','VISA_AGENT','ACCOUNTING','AGENCY_ADMIN','AGENCY_USER')),
  constraint users_role_agency_check check ((role in ('AGENCY_ADMIN','AGENCY_USER')) = (agency_id is not null)),
  constraint users_status_check check (status in ('ACTIVE','SUSPENDED'))
);
create unique index users_email_unique on users (lower(email));
create index users_agency_idx on users (agency_id);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id);

-- =============== Visa configuration ===============

create table countries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  iso2 char(2) not null,
  region text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint countries_iso2_format check (iso2 ~ '^[A-Z]{2}$')
);
create unique index countries_iso2_unique on countries (iso2);

create table visa_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table visa_types (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries (id),
  category_id uuid not null references visa_categories (id),
  name text not null,
  code text not null unique,
  description text,
  processing_min_days integer not null default 5,
  processing_max_days integer not null default 15,
  fee numeric(14,2) not null default 0,
  currency char(3) not null default 'EUR',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visa_types_processing_check check (processing_min_days <= processing_max_days),
  constraint visa_types_fee_nonnegative check (fee >= 0)
);
create index visa_types_country_idx on visa_types (country_id);

create table document_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table visa_requirements (
  id uuid primary key default gen_random_uuid(),
  visa_type_id uuid not null references visa_types (id) on delete cascade,
  document_type_id uuid not null references document_types (id),
  required boolean not null default true,
  sort_order integer not null default 0,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visa_requirements_unique unique (visa_type_id, document_type_id)
);

create table currencies (
  id uuid primary key default gen_random_uuid(),
  code char(3) not null unique,
  name text not null,
  symbol text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============== Workflow configuration ===============

create table statuses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_terminal boolean not null default false,
  is_draft boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table status_transitions (
  from_status_id uuid not null references statuses (id) on delete cascade,
  to_status_id uuid not null references statuses (id) on delete cascade,
  scope text not null default 'STAFF',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (from_status_id, to_status_id),
  constraint status_transitions_scope_check check (scope in ('STAFF','AGENCY','BOTH'))
);

create table priorities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  weight integer not null default 0,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============== Applications ===============

create table applications (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  agency_id uuid not null references agencies (id),
  country_id uuid not null references countries (id),
  visa_type_id uuid not null references visa_types (id),
  status_id uuid not null references statuses (id),
  priority_id uuid not null references priorities (id),
  -- immutable configuration snapshots
  visa_type_name text not null,
  visa_type_code text not null,
  category_name text not null,
  country_name text not null,
  fee numeric(14,2) not null,
  currency char(3) not null,
  processing_min_days integer not null,
  processing_max_days integer not null,
  -- workflow
  agency_notes text,
  internal_notes text,
  created_by uuid references users (id),
  assigned_to uuid references users (id),
  submitted_at timestamptz,
  completed_at timestamptz,
  decision_at timestamptz,
  override_reason text,
  override_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index applications_agency_idx on applications (agency_id);
create index applications_status_idx on applications (status_id);
create index applications_created_at_idx on applications (created_at);

create table applicants (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id),
  first_name text not null,
  middle_name text,
  last_name text not null,
  date_of_birth date not null,
  gender text,
  nationality text not null,
  passport_number text not null,
  passport_issue_date date,
  passport_expiry_date date not null,
  email text,
  phone text,
  address_line text,
  city text,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applicants_gender_check check (gender is null or gender in ('MALE','FEMALE','OTHER'))
);
create index applicants_application_idx on applicants (application_id);

create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id) on delete cascade,
  document_type_id uuid references document_types (id),
  document_type_name text not null,
  document_type_code text not null,
  required boolean not null,
  sort_order integer not null default 0,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint checklist_items_unique unique (application_id, document_type_code)
);
create index checklist_items_application_idx on checklist_items (application_id);

-- =============== Documents ===============

create table documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id),
  applicant_id uuid references applicants (id) on delete set null,
  checklist_item_id uuid references checklist_items (id) on delete set null,
  document_type_id uuid not null references document_types (id),
  original_filename text not null,
  mime_type text not null,
  size_bytes integer not null,
  storage_key text not null,
  status text not null default 'UPLOADED',
  review_notes text,
  rejection_reason text,
  reviewed_by uuid references users (id),
  reviewed_at timestamptz,
  uploaded_by uuid references users (id),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_status_check check (status in ('UPLOADED','UNDER_REVIEW','ACCEPTED','REJECTED','RESUBMISSION_REQUIRED'))
);
create index documents_application_idx on documents (application_id);
create index documents_status_idx on documents (status);
create index documents_storage_key_idx on documents (storage_key);

-- =============== Wallet ledger ===============

create table wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  application_id uuid references applications (id) on delete set null,
  type text not null,
  amount numeric(14,2) not null,
  currency char(3) not null,
  balance_before numeric(14,2) not null,
  balance_after numeric(14,2) not null,
  reason text not null,
  actor_id uuid references users (id),
  created_at timestamptz not null default now(),
  constraint wallet_tx_amount_positive check (amount > 0),
  constraint wallet_tx_type_check check (type in ('CREDIT','DEBIT','APPLICATION_CHARGE'))
);
create index wallet_transactions_agency_idx on wallet_transactions (agency_id, created_at);
-- Idempotency: exactly one automatic charge per application, ever.
create unique index wallet_tx_charge_once_idx
  on wallet_transactions (application_id)
  where type = 'APPLICATION_CHARGE';

-- =============== Notifications / communications / audit ===============

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  agency_id uuid references agencies (id) on delete cascade,
  application_id uuid references applications (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at);

create table communications (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id) on delete cascade,
  author_id uuid not null references users (id),
  visibility text not null default 'AGENCY',
  body text not null,
  created_at timestamptz not null default now(),
  constraint communications_visibility_check check (visibility in ('INTERNAL','AGENCY'))
);
create index communications_application_idx on communications (application_id, created_at);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users (id) on delete set null,
  actor_email text,
  actor_role text,
  agency_id uuid references agencies (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  metadata jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on audit_logs (created_at);
create index audit_logs_entity_idx on audit_logs (entity, entity_id);
create index audit_logs_agency_idx on audit_logs (agency_id);

create table application_status_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id) on delete cascade,
  from_status_id uuid references statuses (id),
  to_status_id uuid not null references statuses (id),
  changed_by uuid references users (id),
  reason text,
  created_at timestamptz not null default now()
);
create index application_status_history_application_idx
  on application_status_history (application_id, created_at);

-- =============== Secure blob storage (provider: "db") ===============

create table document_blobs (
  key text primary key,
  mime_type text not null,
  size_bytes integer not null,
  data bytea not null,
  created_at timestamptz not null default now()
);

-- =============== CMS ===============

create table site_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now()
);
