-- =====================================================================
-- 0010 — Phase 2-Final: simplified single-applicant request flow
-- Idempotent. Never rewrites or deletes historical applicant data.
-- =====================================================================

-- One application = one applicant; the portal now collects ONLY
-- Full Name + Nationality. Legacy passport/DOB columns stay for
-- historical applications and simply become optional for new rows.
alter table applicants alter column date_of_birth drop not null;
alter table applicants alter column passport_number drop not null;
alter table applicants alter column passport_expiry_date drop not null;

alter table applicants add column if not exists full_name text;

-- Historical readability: no backfill — legacy rows keep their per-field
-- values; display logic falls back to first/last name when full_name is null.
