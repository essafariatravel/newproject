-- 0005 — Canonical final-decision model: APPROVED / REJECTED only.
--
-- Phase 2.1 introduced REJECTED alongside the pre-existing REFUSED, creating
-- a duplicate negative outcome. This migration normalizes the model:
--   * REJECTED is the single canonical negative final outcome.
--   * REFUSED becomes an inactive legacy status (historical data preserved:
--     status-history rows keep pointing at the legacy id; the row is NOT
--     deleted or renamed into another semantic).
--   * Applications currently sitting at REFUSED are remapped to REJECTED
--     (same meaning, canonical code). A notice reports how many rows moved.
--   * All transition edges touching REFUSED are removed so the legacy code
--     cannot be selected anymore; REJECTED edges are (re)ensured.
--
-- Everything is idempotent-safe (on conflict / existence checks).

/* 1. Ensure canonical REJECTED exists (same shape as 0004; idempotent). */
insert into statuses (code, name, sort_order, active, is_terminal, is_draft)
values ('REJECTED', 'Rejected', 85, true, true, false)
on conflict (code) do
update
  set name = excluded.name,
      is_terminal = true,
      active = true;

/* 2. Inspect legacy REFUSED usage before touching anything. */
do $$
declare
  refused_id uuid;
  n_apps integer;
  n_hist integer;
begin
  select id into refused_id from statuses where code = 'REFUSED';
  if refused_id is null then
    raise notice '0005: no legacy REFUSED status present — nothing to normalize';
    return;
  end if;

  select count(*) into n_apps from applications where status_id = refused_id;
  select count(*) into n_hist
    from application_status_history
    where from_status_id = refused_id or to_status_id = refused_id;
  raise notice '0005: REFUSED legacy presence — % live application(s), % historical transition record(s)', n_apps, n_hist;
end $$;

/* 3. Remap live applications at REFUSED onto canonical REJECTED. */
update applications
   set status_id = (select id from statuses where code = 'REJECTED'),
       updated_at = now()
 where status_id = (select id from statuses where code = 'REFUSED');

-- Historical application_status_history intentionally keeps referencing the
-- legacy REFUSED status row (audit accuracy).

/* 4. Remove all transition edges touching REFUSED (both directions). */
delete from status_transitions
 where from_status_id = (select id from statuses where code = 'REFUSED')
    or to_status_id = (select id from statuses where code = 'REFUSED');

/* 5. Deactivate the legacy status with an unambiguous display name. */
update statuses
   set active = false,
       name = 'Rejected (legacy)',
       updated_at = now()
 where code = 'REFUSED';

/* 6. (Re)ensure canonical REJECTED transition edges (matches 0004). */
insert into status_transitions (from_status_id, to_status_id, scope)
select f.id, t.id, sval.scope
from (
  values
    ('PROCESSING',         'REJECTED',  'STAFF'),
    ('AWAITING_DECISION',  'REJECTED',  'STAFF'),
    ('EMBASSY_SUBMISSION', 'REJECTED',  'STAFF'),
    ('REJECTED',           'COMPLETED', 'STAFF')
) as sval(frm, too, scope)
join statuses f on f.code = sval.frm
join statuses t on t.code = sval.too
on conflict (from_status_id, to_status_id) do
update set scope = excluded.scope;

/* 7. Approvals remain double-gated: APPROVED reachable only from AWAITING_DECISION. */
delete from status_transitions
 where to_status_id = (select id from statuses where code = 'APPROVED')
   and from_status_id <> (select id from statuses where code = 'AWAITING_DECISION');

insert into status_transitions (from_status_id, to_status_id, scope)
select f.id, t.id, 'STAFF'
from statuses f
join statuses t on t.code = 'APPROVED'
where f.code = 'AWAITING_DECISION'
on conflict (from_status_id, to_status_id) do
update set scope = excluded.scope;
