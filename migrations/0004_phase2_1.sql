-- ---------------------------------------------------------------------------
-- 0004_phase2_1.sql — DZD currency + final-decision workflow configuration
--
-- Everything here is IDEMPOTENT and additive:
--   * DZD becomes available and the DEFAULT wallet currency for NEW agencies.
--     No existing agency balance, ledger row or application fee snapshot is
--     altered — historical records keep their original currency.
--   * REJECTED becomes a first-class final decision status (config-driven,
--     same architecture as APPROVED/REFUSED) with staff-scoped transitions.
--   * Two decision document classifications (issued visa / refusal letter).
-- ---------------------------------------------------------------------------

-- 1. DZD currency -------------------------------------------------------------
insert into currencies (code, name, symbol, active, sort_order)
values ('DZD', 'Algerian Dinar', 'دج', true, 5)
on conflict (code) do nothing;

-- 2. Default wallet currency for NEW agencies --------------------------------
--    (column default only — zero historical rows are modified)
alter table agencies alter column currency set default 'DZD';

-- 3. Final decision status: REJECTED -----------------------------------------
insert into statuses (code, name, description, sort_order, is_terminal, is_draft, active)
values ('REJECTED', 'Rejected', 'Application rejected — refusal decision issued.', 85, true, false, true)
on conflict (code) do nothing;

-- Staff-only transitions into REJECTED, mirroring the existing REFUSED edges.
insert into status_transitions (from_status_id, to_status_id, scope)
select f.id, t.id, 'STAFF'
from statuses f
cross join statuses t
where t.code = 'REJECTED'
  and f.code in ('PROCESSING', 'EMBASSY_SUBMISSION', 'AWAITING_DECISION')
  and f.active
  and t.active
on conflict do nothing;

-- Closing a rejected file, consistent with REFUSED -> COMPLETED.
insert into status_transitions (from_status_id, to_status_id, scope)
select f.id, t.id, 'STAFF'
from statuses f
cross join statuses t
where f.code = 'REJECTED'
  and t.code = 'COMPLETED'
  and f.active
  and t.active
on conflict do nothing;

-- 4. Decision document classifications ---------------------------------------
insert into document_types (code, name, description, active, sort_order)
values
  ('DECISION_VISA_APPROVAL', 'Issued Visa / Approval Decision', 'Official visa or approval document issued by the authority. Visible to the owning agency as a read-only decision document.', true, 900),
  ('DECISION_REFUSAL_LETTER', 'Refusal / Rejection Decision Letter', 'Official refusal or rejection letter issued by the authority. Visible to the owning agency as a read-only decision document.', true, 910)
on conflict (code) do nothing;
