-- =====================================================================
-- 0009 — Phase 2.3: atomic visa-request submission (3-step portal flow)
-- Idempotent. Runs with search_path set to the application schema.
-- =====================================================================

-- Client-generated idempotency key (UUID) making browser retries and
-- double-clicks safe: the second submit returns the SAME application.
alter table applications
  add column if not exists idempotency_key text;

create unique index if not exists applications_idempotency_key_uq
  on applications (idempotency_key)
  where idempotency_key is not null;
