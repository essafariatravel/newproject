-- 0028 — immutable stored-file identity and wallet top-up proof integrity
--
-- Permanent file bytes and their business metadata must not be silently
-- rewritten after insertion. Workflow/review/decision fields remain mutable.
-- New top-up receipts also carry SHA-256 so money cannot be credited against
-- bytes that differ from the receipt originally submitted.

alter table wallet_topup_requests
  add column if not exists proof_sha256 text;

alter table wallet_topup_requests
  add constraint wallet_topup_proof_sha256_format_check
  check (proof_sha256 is null or proof_sha256 ~ '^[0-9a-f]{64}$');

create or replace function reject_permanent_blob_rewrite() returns trigger
language plpgsql as $$
begin
  if old.key like 'visa-documents/%'
     or old.key like 'agency-registrations/%'
     or old.key like 'topup-proofs/%' then
    raise exception 'Permanent stored file bytes are immutable';
  end if;
  return new;
end;
$$;

create trigger document_blobs_permanent_immutable
before update on document_blobs
for each row execute function reject_permanent_blob_rewrite();

create or replace function enforce_document_file_identity_immutable() returns trigger
language plpgsql as $$
begin
  if row(new.storage_key, new.original_filename, new.mime_type, new.size_bytes, new.sha256)
     is distinct from
     row(old.storage_key, old.original_filename, old.mime_type, old.size_bytes, old.sha256) then
    raise exception 'Stored document identity is immutable';
  end if;
  return new;
end;
$$;

create trigger documents_file_identity_immutable
before update on documents
for each row execute function enforce_document_file_identity_immutable();

create trigger registration_documents_file_identity_immutable
before update on agency_registration_documents
for each row execute function enforce_document_file_identity_immutable();

create or replace function enforce_topup_request_identity_immutable() returns trigger
language plpgsql as $$
begin
  if row(
      new.reference, new.agency_id, new.amount, new.currency, new.note,
      new.requested_by, new.idempotency_key, new.proof_storage_key,
      new.proof_filename, new.proof_mime_type, new.proof_size_bytes, new.proof_sha256
    ) is distinct from row(
      old.reference, old.agency_id, old.amount, old.currency, old.note,
      old.requested_by, old.idempotency_key, old.proof_storage_key,
      old.proof_filename, old.proof_mime_type, old.proof_size_bytes, old.proof_sha256
    ) then
    raise exception 'Wallet top-up request identity and receipt are immutable';
  end if;
  return new;
end;
$$;

create trigger wallet_topup_request_identity_immutable
before update on wallet_topup_requests
for each row execute function enforce_topup_request_identity_immutable();

-- New functions created after 0026 inherit its default EXECUTE revocations, but
-- pin all application functions again so search_path remains explicit and the
-- privilege invariant stays self-contained if migrations are replayed alone.
do $$
declare
  selected_schema text := current_schema();
  fn record;
  role_name text;
begin
  if selected_schema is null then
    raise exception 'Select an application schema before applying file identity hardening';
  end if;

  for fn in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = selected_schema
  loop
    execute format(
      'alter function %I.%I(%s) set search_path to pg_catalog, %I',
      selected_schema, fn.proname, fn.args, selected_schema
    );
  end loop;

  execute format('revoke all on all functions in schema %I from public', selected_schema);
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on all functions in schema %I from %I', selected_schema, role_name);
    end if;
  end loop;
end $$;
