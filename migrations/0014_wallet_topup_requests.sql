-- 0014 — Agency wallet top-up requests (no payment gateway in V1)
-- §10: an agency that cannot fund a submission is never at a dead end. It can
-- raise a persisted top-up request; authorised staff review it and credit the
-- wallet through the normal wallet service, which is then linked back here.
--
-- Design notes:
--  * Processing NEVER invents money: the credit happens through adjustWallet()
--    and the resulting ledger row id is stored on the request.
--  * `wallet_transaction_id` is UNIQUE — one request can never produce two
--    credits, and one credit can never satisfy two requests (idempotent).
--  * Lifecycle is guarded in SQL (status check) and in code (conditional
--    UPDATE ... WHERE status = 'PENDING'), so concurrent processing is safe.

-- Defensive: 0012 created this trigger helper; re-declare so 0014 is
-- self-contained if it is ever applied to a schema that skipped 0012.
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create sequence if not exists wallet_topup_reference_seq;

create or replace function generate_topup_reference() returns text language plpgsql as $$
declare
  y text := to_char(now(), 'YYYY');
  n bigint := nextval('wallet_topup_reference_seq'::regclass);
begin
  return 'TOP-' || y || '-' || lpad(n::text, 6, '0');
end;
$$;

create table if not exists wallet_topup_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null default generate_topup_reference(),
  agency_id uuid not null references agencies(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  currency char(3) not null default 'DZD',
  note text,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PROCESSED', 'REJECTED', 'CANCELLED')),
  requested_by uuid references users(id) on delete set null,
  processed_by uuid references users(id) on delete set null,
  wallet_transaction_id uuid references wallet_transactions(id) on delete set null,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index if not exists wallet_topup_requests_reference_unique
  on wallet_topup_requests (reference);

-- One credit satisfies one request, exactly once.
create unique index if not exists wallet_topup_requests_tx_unique
  on wallet_topup_requests (wallet_transaction_id)
  where wallet_transaction_id is not null;

create index if not exists wallet_topup_requests_agency_idx
  on wallet_topup_requests (agency_id, created_at desc);

create index if not exists wallet_topup_requests_status_idx
  on wallet_topup_requests (status, created_at desc);

-- At most one open request per agency keeps the work queue unambiguous.
create unique index if not exists wallet_topup_requests_one_pending_idx
  on wallet_topup_requests (agency_id)
  where status = 'PENDING';

drop trigger if exists wallet_topup_requests_updated_at on wallet_topup_requests;
create trigger wallet_topup_requests_updated_at
  before update on wallet_topup_requests
  for each row execute function set_updated_at();
