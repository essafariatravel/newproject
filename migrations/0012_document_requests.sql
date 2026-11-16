-- 0012 — Staff-requested document replacement & additional document workflow
-- Supports post-submit document locking: agency can only upload when explicitly requested.

create table if not exists document_requests (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  checklist_item_id uuid references checklist_items(id) on delete set null,
  document_type_id uuid not null references document_types(id),
  type text not null check (type in ('REPLACEMENT','ADDITIONAL')),
  status text not null default 'OPEN' check (status in ('OPEN','FULFILLED','CANCELLED')),
  reason text not null,
  requested_by uuid references users(id) on delete set null,
  fulfilled_by uuid references users(id) on delete set null,
  fulfilled_document_id uuid references documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

create index if not exists document_requests_application_idx on document_requests(application_id, created_at);
create index if not exists document_requests_status_idx on document_requests(status);
create index if not exists document_requests_checklist_item_idx on document_requests(checklist_item_id);
create index if not exists document_requests_document_type_idx on document_requests(document_type_id);

-- Trigger to auto-update updated_at
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists document_requests_updated_at on document_requests;
create trigger document_requests_updated_at
  before update on document_requests
  for each row execute function set_updated_at();
