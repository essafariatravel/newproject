-- 0015 — schema-safe human references for wallet transactions and top-up requests
--
-- Root cause fixed here (verified by rendering the real database, not by reading
-- code): `generate_wallet_reference()` / `generate_topup_reference()` are plpgsql
-- functions whose body did `nextval('wallet_reference_seq'::regclass)`. plpgsql
-- resolves an unqualified name at FIRST EXECUTION using the session's
-- search_path, so the same table could draw numbers from two different counters
-- depending on the connection:
--
--   * the application connects with its default search_path and qualifies every
--     table explicitly (`visa_os_preview.wallet_transactions`) — the unqualified
--     sequence then resolved to `public.wallet_reference_seq`;
--   * scripts/tests that run `set search_path to "visa_os_preview"` resolved the
--     same name to `visa_os_preview.wallet_reference_seq`.
--
-- Because Preview (`visa_os_preview`) and Production (`visa_os`) live in ONE
-- physical database, two independent counters fed one table and produced
-- DUPLICATE references (observed: rows WLT-2026-000003/000004 written by the
-- public counter while the schema counter was at 1), which then made a legitimate
-- wallet insert fail with `duplicate key value violates unique constraint
-- "wallet_transactions_reference_unique"`.
--
-- Fix: generate the reference in a BEFORE INSERT trigger, where `tg_table_schema`
-- tells us the schema the row is actually going into, and qualify the sequence
-- dynamically. No session state, no search_path dependency, still one counter per
-- schema, still server-generated and immutable from the application's point of
-- view.
--
-- Forward-only and idempotent: the 0011/0014 column defaults are dropped (the
-- trigger replaces them) and every schema's counter is resynced above the
-- highest reference already stored in that schema.

create sequence if not exists wallet_reference_seq;
create sequence if not exists wallet_topup_reference_seq;

create or replace function assign_wallet_reference() returns trigger language plpgsql as $$
declare
  n bigint;
begin
  if new.reference is null then
    execute format('select nextval(%L)', format('%I.wallet_reference_seq', tg_table_schema)) into n;
    new.reference := 'WLT-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 6, '0');
  end if;
  return new;
end;
$$;

create or replace function assign_topup_reference() returns trigger language plpgsql as $$
declare
  n bigint;
begin
  if new.reference is null then
    execute format('select nextval(%L)', format('%I.wallet_topup_reference_seq', tg_table_schema)) into n;
    new.reference := 'TOP-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists wallet_transactions_reference on wallet_transactions;
create trigger wallet_transactions_reference
  before insert on wallet_transactions
  for each row execute function assign_wallet_reference();

drop trigger if exists wallet_topup_requests_reference on wallet_topup_requests;
create trigger wallet_topup_requests_reference
  before insert on wallet_topup_requests
  for each row execute function assign_topup_reference();

-- Resync this schema's counters above every reference already stored HERE, so a
-- counter that fell behind the table (the bug above) can never collide again.
do $$
declare
  max_wallet bigint;
  max_topup bigint;
begin
  select coalesce(max(nullif(regexp_replace(reference, '^WLT-[0-9]{4}-', ''), '')::bigint), 0)
    into max_wallet
    from wallet_transactions
   where reference ~ '^WLT-[0-9]{4}-[0-9]+$';

  if max_wallet > 0 then
    execute format('select setval(%L, %s, true)', format('%I.wallet_reference_seq', current_schema()), max_wallet);
  end if;

  select coalesce(max(nullif(regexp_replace(reference, '^TOP-[0-9]{4}-', ''), '')::bigint), 0)
    into max_topup
    from wallet_topup_requests
   where reference ~ '^TOP-[0-9]{4}-[0-9]+$';

  if max_topup > 0 then
    execute format('select setval(%L, %s, true)', format('%I.wallet_topup_reference_seq', current_schema()), max_topup);
  end if;
end $$;

-- The triggers are authoritative now: a column default would be evaluated first
-- and then overwritten, wasting numbers from the wrong schema's counter.
alter table wallet_transactions alter column reference drop default;
alter table wallet_topup_requests alter column reference drop default;

-- Uniqueness of both reference columns is already enforced by 0011/0014
-- (wallet_transactions_reference_unique / wallet_topup_requests_reference_unique);
-- this migration only changes WHO generates the value, never the constraints.
