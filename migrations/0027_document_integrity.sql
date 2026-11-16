-- 0027 — tamper-evident document integrity metadata
--
-- New uploads persist a SHA-256 fingerprint in the business row, independent
-- of the underlying storage provider. Existing rows remain nullable because a
-- historical deployment may have used external storage unavailable to SQL.
-- Downloads always verify byte length; rows with a fingerprint also verify
-- SHA-256 before bytes are served.

alter table documents
  add column if not exists sha256 text;

alter table agency_registration_documents
  add column if not exists sha256 text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'documents_sha256_format_check'
      and conrelid = 'documents'::regclass
  ) then
    alter table documents
      add constraint documents_sha256_format_check
      check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'agency_registration_documents_sha256_format_check'
      and conrelid = 'agency_registration_documents'::regclass
  ) then
    alter table agency_registration_documents
      add constraint agency_registration_documents_sha256_format_check
      check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');
  end if;
end $$;
