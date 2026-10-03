-- 0020_privacy_registration_minimization.sql
-- Privacy-by-default hardening for the PUBLIC agency request-access flow.
--
-- Historical KYC fields and registration-document tables are preserved so
-- existing records remain readable. New first-contact requests no longer need
-- full address, commercial registration number or contact position.
-- Administrative documents are requested later through authorized workflows.

alter table agency_registrations
  alter column address_line drop not null,
  alter column commercial_registration_number drop not null,
  alter column contact_position drop not null;

-- Preserve exact legal-version evidence for new public registrations.
-- Legacy rows remain nullable and retain their historical boolean/timestamp
-- evidence; no backfill is fabricated.
alter table agency_registrations
  add column if not exists terms_version_id uuid,
  add column if not exists privacy_version_id uuid;

create index if not exists agency_registrations_terms_version_idx
  on agency_registrations (terms_version_id)
  where terms_version_id is not null;

create index if not exists agency_registrations_privacy_version_idx
  on agency_registrations (privacy_version_id)
  where privacy_version_id is not null;
