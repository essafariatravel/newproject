-- 0003_agency_registrations.sql
-- Phase 2 — Public B2B agency self-registration & approval workflow.
--
-- Design notes:
--  - A registration is an APPLICATION FOR PARTNERSHIP. It never grants access,
--    credit or an agency by itself. Only an explicit, privileged admin
--    approval links it to a real tenant (agencies) and its first user
--    (users, role AGENCY_ADMIN) inside one transaction.
--  - Idempotency backstop: the partial unique index on agency_id makes it
--    impossible for one registration to ever be linked to two agencies.
--  - Account activation uses single-use, expiring, hashed tokens — the same
--    pattern as sessions (opaque token, SHA-256 hash stored). No plaintext
--    password is ever created or emailed by the platform.

create table agency_registrations (
  id uuid primary key default gen_random_uuid(),

  -- public tracking reference, e.g. AGR-2026-8F3KA2
  reference text not null unique,

  -- registration experience locale: en | fr | ar (drives status communication)
  locale text not null default 'en',

  -- ------------------------------ company ------------------------------
  legal_name text not null,
  trading_name text,
  country text not null,
  region text,
  city text not null,
  address_line text not null,
  phone text not null,
  email text not null,                    -- normalized (trim + lowercase)
  website text,
  commercial_registration_number text not null,
  tax_id text,
  licence_number text,

  -- -------------------------- primary contact ---------------------------
  contact_first_name text not null,
  contact_last_name text not null,
  contact_position text not null,
  contact_email text not null,            -- normalized (trim + lowercase)
  contact_phone text not null,

  -- --------------------------- business profile -------------------------
  business_type text not null,
  monthly_volume text,
  main_markets text,
  message text,

  -- ------------------------------- consent ------------------------------
  terms_accepted boolean not null default false,
  privacy_acknowledged boolean not null default false,
  info_confirmed boolean not null default false,
  consented_at timestamptz,

  -- ------------------------------ workflow ------------------------------
  status text not null default 'PENDING',
  internal_notes text,
  rejection_reason text,

  -- links created ONLY by the privileged approval transaction
  agency_id uuid references agencies (id),
  admin_user_id uuid references users (id),

  reviewed_by uuid references users (id),
  reviewed_at timestamptz,
  decided_by uuid references users (id),
  decided_at timestamptz,

  -- anti-abuse signal / audit (never displayed publicly)
  ip_address text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint agency_registrations_status_check
    check (status in ('PENDING','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','APPROVED','REJECTED')),
  constraint agency_registrations_business_type_check
    check (business_type in ('TRAVEL_AGENCY','TOUR_OPERATOR','VISA_AGENCY','CORPORATE_TRAVEL','WHOLESALER','OTHER')),
  constraint agency_registrations_locale_check
    check (locale in ('en','fr','ar')),
  constraint agency_registrations_consent_check
    check (terms_accepted and privacy_acknowledged and info_confirmed)
);
create index agency_registrations_status_idx on agency_registrations (status);
create index agency_registrations_created_idx on agency_registrations (created_at);
create index agency_registrations_country_idx on agency_registrations (country);
create index agency_registrations_ip_idx on agency_registrations (ip_address, created_at);
-- Idempotency: a registration can be linked to at most one agency, ever.
create unique index agency_registrations_agency_unique
  on agency_registrations (agency_id) where agency_id is not null;
-- Idempotency: a registration can be linked to at most one admin user, ever.
create unique index agency_registrations_admin_user_unique
  on agency_registrations (admin_user_id) where admin_user_id is not null;

create table agency_registration_documents (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references agency_registrations (id),
  category text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes integer not null,
  storage_key text not null,
  created_at timestamptz not null default now(),
  constraint agency_registration_documents_category_check
    check (category in ('COMMERCIAL_REGISTRATION','AGENCY_LICENCE','TAX_DOCUMENT','OTHER'))
);
create index agency_registration_documents_registration_idx
  on agency_registration_documents (registration_id);

create table agency_registration_history (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references agency_registrations (id),
  kind text not null default 'STATUS',
  from_status text,
  to_status text,
  actor_id uuid references users (id),
  note text,
  created_at timestamptz not null default now(),
  constraint agency_registration_history_kind_check
    check (kind in ('STATUS','NOTE','INFO_REQUEST'))
);
create index agency_registration_history_registration_idx
  on agency_registration_history (registration_id, created_at);

-- Single-use, expiring, hashed account-activation tokens ("set my password").
create table account_activation_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  purpose text not null default 'AGENCY_ADMIN_ACTIVATION',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references users (id),
  created_at timestamptz not null default now()
);
create index account_activation_tokens_user_idx on account_activation_tokens (user_id);
