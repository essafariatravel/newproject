-- Follow-up private OCR provenance migration (requires 0036).
-- Verified OCR provenance is kept separate from agency-submitted untrusted text.
create table if not exists passport_mrz_evidence (
  application_id uuid primary key references applications(id) on delete restrict,
  document_id uuid not null references documents(id) on delete restrict,
  verified_by uuid not null references users(id) on delete restrict,
  verified_at timestamptz not null default now(),
  extractor_version text not null,
  constraint passport_mrz_extractor_check check (length(extractor_version) between 2 and 60)
);
create index if not exists passport_mrz_document_idx on passport_mrz_evidence(document_id);
alter table passport_mrz_evidence enable row level security;
revoke all privileges on table passport_mrz_evidence from public, anon, authenticated;
comment on table passport_mrz_evidence is
  'Private provenance for an ICAO-validated, automatic OCR passport number stored on the corresponding applicant.';
