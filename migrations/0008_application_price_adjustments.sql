-- =====================================================================
-- 0008 — Phase 2.2 §17/§18: staff-only price adjustments (discount/refund/
--        surcharge) on submitted applications, with immutable audit trail
--        and compensating wallet ledger entries. Idempotent migration.
-- =====================================================================

-- 1) adjust tracking table (immutable)
create table if not exists application_price_adjustments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id),
  /** DISCOUNT | SURCHARGE | REFUND — discount/refund credit the wallet, surcharge debits */
  type text not null check (type in ('DISCOUNT','SURCHARGE','REFUND')),
  amount numeric(14,2) not null check (amount > 0),
  currency char(3) not null,
  reason text not null check (length(trim(reason)) >= 8),
  effective_before numeric(14,2) not null,
  effective_after numeric(14,2) not null check (effective_after >= 0),
  wallet_transaction_id uuid not null references wallet_transactions(id),
  actor_id uuid not null references users(id),
  idempotency_key text,
  created_at timestamptz not null default now()
);

create index if not exists price_adjustments_application_idx
  on application_price_adjustments(application_id, created_at);

-- idempotency: a replayed key returns the ORIGINAL adjustment, never a duplicate
create unique index if not exists price_adjustments_idempotency_uq
  on application_price_adjustments(idempotency_key)
  where idempotency_key is not null;

-- immutability: no update, no delete — the history is the contract
create or replace function reject_price_adjustment_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'application_price_adjustments is immutable (no % allowed)', tg_op;
end $$;

drop trigger if exists price_adjustments_immutable on application_price_adjustments;
create trigger price_adjustments_immutable
  before update or delete on application_price_adjustments
  for each row execute function reject_price_adjustment_mutation();

-- 2) submitted-effective-price snapshots on applications
alter table applications
  add column if not exists submitted_price numeric(14,2),
  add column if not exists submitted_currency char(3),
  add column if not exists effective_price numeric(14,2);

comment on column applications.submitted_price is 'Snapshot of the catalogue price AT SUBMISSION — never changes afterwards.';
comment on column applications.effective_price is 'Submitted price + all signed adjustments; what the agency effectively owes.';

-- backfill previously submitted applications from their draft-time fee snapshot
update applications
   set submitted_price = coalesce(submitted_price, fee),
       submitted_currency = coalesce(submitted_currency, currency),
       effective_price = coalesce(effective_price, fee)
 where submitted_at is not null;

-- 3) wallet ledger accepts the commercial compensating entry types
alter table wallet_transactions drop constraint if exists wallet_tx_type_check;
alter table wallet_transactions
  add constraint wallet_tx_type_check
  check (type in ('CREDIT','DEBIT','APPLICATION_CHARGE','COMMERCIAL_DISCOUNT','COMMERCIAL_SURCHARGE'));
