-- PROPOSAL ONLY: outside root discovery and candidates 0034/0035.
-- Local qualification does not authorize a hosted migration or worker.
create table storage_operations (
  id uuid primary key default gen_random_uuid(),
  provider_origin text not null,
  bucket text not null,
  object_key text not null,
  mime_type text not null,
  size_bytes integer not null check(size_bytes between 1 and 2097152),
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  state text not null check(state in ('STAGED','UPLOAD_STARTED','UPLOADED','UPLOAD_UNCERTAIN','REFERENCED','DELETE_PENDING','RETRY_REQUIRED','DELETED')),
  attempts integer not null default 0 check(attempts>=0),
  upload_acknowledged_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(provider_origin,bucket,object_key)
);
create index storage_operations_pending_idx on storage_operations(state,updated_at,id)
  where state in ('UPLOAD_STARTED','UPLOAD_UNCERTAIN','DELETE_PENDING','RETRY_REQUIRED');
create table storage_operation_events (
  sequence bigserial primary key,
  operation_id uuid not null references storage_operations(id),
  state text not null check(state in ('STAGED','UPLOAD_STARTED','UPLOADED','UPLOAD_UNCERTAIN','REFERENCED','DELETE_PENDING','RETRY_REQUIRED','DELETED','PRESERVED_REFERENCED')),
  occurred_at timestamptz not null default clock_timestamp(),
  code text not null check(code in ('RESERVED','UPLOAD_BEGIN','UPLOAD_ACKNOWLEDGED','UPLOAD_VERIFIED','UPLOAD_UNCERTAIN','REFERENCE_COMMITTED','DELETE_QUEUED','DELETE_UNCERTAIN','OBJECT_STILL_REFERENCED','OBJECT_ABSENCE_VERIFIED'))
);
create index storage_operation_events_operation_idx on storage_operation_events(operation_id,sequence);
create unique index storage_operation_events_deleted_once on storage_operation_events(operation_id) where state='DELETED';
-- A pending job is an intent, never evidence of completed physical erasure.
-- Payload contains opaque IDs/counts/hashes and journal keys, never file bytes or filenames.
create table document_retention_jobs (
 id uuid primary key default gen_random_uuid(),
 application_id uuid not null references applications(id),
 decision_at timestamptz not null,
 manifest_sha256 text not null check(manifest_sha256 ~ '^[a-f0-9]{64}$'),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 state text not null default 'PENDING' check(state in ('PENDING','COMPLETE')),
 receipt_id uuid,
 created_at timestamptz not null default clock_timestamp(),
 unique(application_id,decision_at),
 check((state='COMPLETE')=(receipt_id is not null))
);
create function reject_retention_job_mutation() returns trigger language plpgsql as $$
declare verified boolean;begin
 if TG_OP='DELETE' then raise exception 'Retention intent is immutable';end if;
 if OLD.state='COMPLETE' or NEW.state<>'COMPLETE' or NEW.receipt_id is null
   or (to_jsonb(NEW)-'state'-'receipt_id') is distinct from (to_jsonb(OLD)-'state'-'receipt_id')
 then raise exception 'Retention intent is immutable';end if;
 execute format('select exists(select 1 from %I.document_retention_receipts where id=$1 and application_id=$2 and decision_at=$3 and manifest_sha256=$4)',TG_TABLE_SCHEMA)
 into verified using NEW.receipt_id,NEW.application_id,NEW.decision_at,NEW.manifest_sha256;
 if not verified then raise exception 'A matching successful retention receipt is required';end if;
 return NEW;
end $$;
create trigger document_retention_jobs_immutable before update or delete on document_retention_jobs
 for each row execute function reject_retention_job_mutation();
create function protect_pending_document_retention() returns trigger language plpgsql as $$
declare dossier_id uuid;begin
 if TG_TABLE_NAME='documents' then dossier_id:=NEW.application_id;
 elsif TG_TABLE_NAME='applications' then dossier_id:=NEW.id;
 elsif NEW.key ~* '^visa-documents/[a-f0-9-]{36}/' then dossier_id:=split_part(NEW.key,'/',2)::uuid;
 end if;
 if dossier_id is not null and exists(select 1 from document_retention_jobs where application_id=dossier_id and state='PENDING')
 then raise exception 'Document retention is pending; the dossier inventory is frozen';end if;
 return NEW;
end $$;
create trigger document_retention_pending_documents before insert or update on documents for each row execute function protect_pending_document_retention();
create trigger document_retention_pending_blobs before insert or update on document_blobs for each row execute function protect_pending_document_retention();
create trigger document_retention_pending_case before update of status_id,decision_at on applications for each row execute function protect_pending_document_retention();
create function reject_storage_operation_identity_mutation() returns trigger language plpgsql as $$
begin
 if TG_OP='DELETE' then raise exception 'Storage operation identity is immutable';end if;
 if (OLD.upload_acknowledged_at is not null and NEW.upload_acknowledged_at is distinct from OLD.upload_acknowledged_at) or OLD.state='DELETED' or ROW(NEW.id,NEW.provider_origin,NEW.bucket,NEW.object_key,NEW.mime_type,NEW.size_bytes,NEW.sha256,NEW.created_at)
   is distinct from ROW(OLD.id,OLD.provider_origin,OLD.bucket,OLD.object_key,OLD.mime_type,OLD.size_bytes,OLD.sha256,OLD.created_at)
 then raise exception 'Storage operation identity is immutable';end if;
 return NEW;
end $$;
create trigger storage_operations_identity before update or delete on storage_operations
 for each row execute function reject_storage_operation_identity_mutation();
create function reject_storage_operation_event_mutation() returns trigger language plpgsql as $$
begin raise exception 'Storage operation evidence is immutable';end $$;
create trigger storage_operation_events_immutable before update or delete on storage_operation_events
 for each row execute function reject_storage_operation_event_mutation();
alter table storage_operations enable row level security;
alter table storage_operation_events enable row level security;
alter table document_retention_jobs enable row level security;
revoke all on table storage_operations,storage_operation_events,document_retention_jobs from public;
revoke all on sequence storage_operation_events_sequence_seq from public;
do $$ declare app_schema text:=current_schema(); role_name text; relation_name text; function_name text; begin
 foreach function_name in array array['reject_storage_operation_identity_mutation','reject_storage_operation_event_mutation','reject_retention_job_mutation','protect_pending_document_retention'] loop
  execute format('alter function %I.%I() set search_path to pg_catalog, %I',app_schema,function_name,app_schema);
  execute format('revoke all on function %I.%I() from public',app_schema,function_name);
 end loop;
 foreach role_name in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=role_name) then
   foreach relation_name in array array['storage_operations','storage_operation_events','document_retention_jobs'] loop
    execute format('revoke all on table %I.%I from %I',app_schema,relation_name,role_name);
   end loop;
   execute format('revoke all on sequence %I.storage_operation_events_sequence_seq from %I',app_schema,role_name);
   foreach function_name in array array['reject_storage_operation_identity_mutation','reject_storage_operation_event_mutation','reject_retention_job_mutation','protect_pending_document_retention'] loop
    execute format('revoke all on function %I.%I() from %I',app_schema,function_name,role_name);
   end loop;
  end if;
 end loop;
end $$;
