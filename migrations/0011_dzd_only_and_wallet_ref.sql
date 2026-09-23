-- 0011 — DZD-only operational currency + wallet transaction human-readable reference
-- Idempotent, preserves historical data, additive.

-- Ensure DZD currency exists (from 0004, but idempotent)
insert into currencies (code, name, symbol, active, sort_order)
values ('DZD', 'Algerian Dinar', 'دج', true, 5)
on conflict (code) do nothing;

-- New agencies and visa types default to DZD (historical rows untouched)
alter table agencies alter column currency set default 'DZD';
alter table visa_types alter column currency set default 'DZD';

-- Wallet transaction reference: human-readable, unique, immutable, e.g. WLT-2026-000123
create sequence if not exists wallet_reference_seq;

alter table wallet_transactions add column if not exists reference text;

create or replace function generate_wallet_reference() returns text language plpgsql as $$
declare
  y text := to_char(now(), 'YYYY');
  n bigint := nextval('wallet_reference_seq');
begin
  return 'WLT-' || y || '-' || lpad(n::text, 6, '0');
end;
$$;

-- Backfill existing rows without reference
do $$
begin
  if exists (select 1 from information_schema.columns where table_name='wallet_transactions' and column_name='reference') then
    update wallet_transactions set reference = generate_wallet_reference() where reference is null;
  end if;
end $$;

-- Enforce not null and uniqueness after backfill (idempotent)
do $$
begin
  -- Only add not null if all rows have reference
  if not exists (select 1 from wallet_transactions where reference is null) then
    begin
      alter table wallet_transactions alter column reference set not null;
    exception when others then
      -- column already not null or other concurrent condition
      null;
    end;
  end if;
end $$;

create unique index if not exists wallet_transactions_reference_unique on wallet_transactions (reference);

-- Default for future inserts
alter table wallet_transactions alter column reference set default generate_wallet_reference();
