-- 0013 — Visa Type embassy-step applicability
-- §18/§42: the "Sent to Embassy" stage is NOT globally mandatory. Each visa
-- programme declares whether an embassy/external-authority step applies:
--   NOT_APPLICABLE — this programme never goes to an embassy
--   OPTIONAL       — staff may send it (kept as the safe default for existing rows)
--   APPLICABLE     — an embassy step is part of this programme's process
--
-- Additive and non-destructive: existing rows keep their current operational
-- behaviour (OPTIONAL) and no historical application is touched.

alter table visa_types
  add column if not exists embassy_applicability text not null default 'OPTIONAL';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'visa_types_embassy_applicability_check'
  ) then
    alter table visa_types
      add constraint visa_types_embassy_applicability_check
      check (embassy_applicability in ('NOT_APPLICABLE', 'OPTIONAL', 'APPLICABLE'));
  end if;
end $$;

create index if not exists visa_types_embassy_applicability_idx
  on visa_types (embassy_applicability);
