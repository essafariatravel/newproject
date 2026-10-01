-- Additive preproduction safeguards. Existing financial and decision history is
-- retained; newly recorded decisions and top-ups must carry their official file.
alter table wallet_topup_requests add column if not exists proof_storage_key text;
alter table wallet_topup_requests add column if not exists proof_filename text;
alter table wallet_topup_requests add column if not exists proof_mime_type text;
alter table wallet_topup_requests add column if not exists proof_size_bytes integer;
alter table wallet_topup_requests add column if not exists idempotency_key uuid;

alter table wallet_topup_requests add constraint wallet_topup_proof_metadata_check check (
  (proof_storage_key is null and proof_filename is null and proof_mime_type is null and proof_size_bytes is null)
  or (proof_storage_key is not null and length(proof_storage_key) > 0 and proof_filename is not null
    and length(proof_filename) between 1 and 200 and proof_mime_type is not null and proof_mime_type in ('application/pdf','image/jpeg','image/png')
    and proof_size_bytes is not null and proof_size_bytes between 1 and 2097152)
);
create unique index wallet_topup_idempotency_unique on wallet_topup_requests (agency_id, idempotency_key)
  where idempotency_key is not null;

create or replace function reject_wallet_history_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'wallet_transactions is immutable (no % allowed); use a compensating entry', tg_op;
end;
$$;
create trigger wallet_transactions_immutable before update or delete on wallet_transactions
  for each row execute function reject_wallet_history_mutation();

-- A programme slot may have one live request, regardless of replacement versus
-- additional origin. Retain superseded rows as cancelled history.
with ranked as (
  select id, row_number() over (partition by application_id, document_type_id order by created_at desc, id desc) as n
    from document_requests where status = 'OPEN'
)
update document_requests set status = 'CANCELLED', updated_at = now() where id in (select id from ranked where n > 1);
update document_requests r set status = 'CANCELLED', updated_at = now()
  from applications a join statuses s on s.id = a.status_id
  where r.application_id = a.id and r.status = 'OPEN' and s.is_terminal;
create unique index document_requests_one_open_slot on document_requests(application_id, document_type_id) where status = 'OPEN';

-- Dynamic relation qualification follows the triggering table's schema, rather
-- than a pooled connection's search_path.
create or replace function enforce_official_final_decision() returns trigger language plpgsql as $$
declare outcome text; expected_type text; official_exists boolean;
begin
  if tg_op = 'UPDATE' and new.status_id = old.status_id then return new; end if;
  execute format('select code from %I.statuses where id=$1', tg_table_schema) into outcome using new.status_id;
  if outcome not in ('APPROVED','REJECTED') then return new; end if;
  expected_type := case outcome when 'APPROVED' then 'DECISION_VISA_APPROVAL' else 'DECISION_REFUSAL_LETTER' end;
  execute format('select exists(select 1 from %I.documents d join %I.document_types t on t.id=d.document_type_id
    where d.application_id=$1 and t.code=$2 and d.status=''ACCEPTED'' and d.size_bytes between 1 and 2097152
      and d.storage_key is not null and length(d.storage_key)>0 and d.uploaded_by is not null and d.reviewed_by is not null)', tg_table_schema, tg_table_schema)
    into official_exists using new.id, expected_type;
  if new.decision_at is null or not official_exists then
    raise exception 'An official persisted decision document and decision timestamp are required';
  end if;
  return new;
end;
$$;
create constraint trigger applications_official_final_decision after insert or update on applications
  deferrable initially deferred for each row execute function enforce_official_final_decision();

create or replace function enforce_topup_credit_proof() returns trigger language plpgsql as $$
begin
  if new.status = 'PROCESSED' and (tg_op = 'INSERT' or old.status <> 'PROCESSED') then
    if new.proof_storage_key is null or new.proof_filename is null or new.proof_mime_type is null
      or new.proof_size_bytes is null or new.wallet_transaction_id is null or new.processed_by is null or new.processed_at is null then
      raise exception 'A persisted receipt and linked wallet credit are required to process a top-up';
    end if;
  end if;
  return new;
end;
$$;
create trigger wallet_topup_credit_proof before insert or update on wallet_topup_requests
  for each row execute function enforce_topup_credit_proof();
