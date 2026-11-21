-- Private ingestion ledger: replay, crash/retry and duplicate-message protection.
-- No Data API grants; only server-side DB role can insert/update.
create table if not exists vfs_china_mail_events (
  gmail_message_id text primary key,
  certificate_reference text not null,
  pdf_sha256 text not null,
  application_id uuid not null references applications(id) on delete restrict,
  status text not null default 'PROCESSING',
  decision_document_id uuid references documents(id) on delete restrict,
  attempts integer not null default 1,
  leased_until timestamptz not null default (now() + interval '10 minutes'),
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vfs_china_mail_id_check check (length(gmail_message_id) between 8 and 120),
  constraint vfs_china_mail_hash_check check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  constraint vfs_china_mail_reference_check check (certificate_reference ~ '^ALG[A-Z0-9]{10,26}$'),
  constraint vfs_china_mail_status_check check (status in ('PROCESSING','COMPLETED','REVIEW_REQUIRED'))
);
create unique index if not exists vfs_china_one_completed_reference_idx
  on vfs_china_mail_events(certificate_reference) where status='COMPLETED';
create index if not exists vfs_china_mail_app_idx
  on vfs_china_mail_events(application_id,created_at desc);
alter table vfs_china_mail_events enable row level security;
revoke all privileges on vfs_china_mail_events from public, anon, authenticated;
comment on table vfs_china_mail_events is
  'Private certificate ingestion idempotency ledger; no raw email, passport number or PDF bytes retained.';
