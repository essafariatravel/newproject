-- 0025_legal_privacy_readiness.sql
-- Separate owner/legal-approved effective dates from the actual system
-- publication timestamp, while preserving immutable published history.

alter table legal_versions
  add column if not exists effective_at timestamptz;

-- Existing versions (if any in a non-Production test/preview database) were
-- created when published_at carried the effective/publication meaning. This
-- one-time migration backfills the new field from that existing evidence.
alter table legal_versions disable trigger legal_history_immutable;
update legal_versions
set effective_at = published_at
where effective_at is null;
alter table legal_versions enable trigger legal_history_immutable;

alter table legal_versions
  alter column effective_at set not null,
  alter column published_at set default now();

create index if not exists legal_versions_effective_idx
  on legal_versions (kind, locale, effective_at desc, version desc);
