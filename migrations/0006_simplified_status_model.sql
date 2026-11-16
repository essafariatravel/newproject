-- 0006 — Simplified operational status model (Phase 2.2).
--
-- The default visa-workflow statuses are now exactly:
--   DRAFT → SUBMITTED → DOCUMENTS_CHECKING → IN_PROCESS → APPROVED / REJECTED
--   (+ DOCUMENTS_REQUESTED loop, optional EMBASSY_SENT branch)
-- CANCELLED stays active as the existing draft/submission cancellation path.
-- AWAITING_DECISION is retired (decisions are recorded directly from
-- IN_PROCESS / EMBASSY_SENT via the dedicated decision workflow).
-- COMPLETED is retired (final states are APPROVED / REJECTED).
--
-- Retired statuses (UNDER_REVIEW, DOCUMENTS_REQUIRED, PROCESSING,
-- EMBASSY_SUBMISSION, AWAITING_DECISION, COMPLETED) are DEACTIVATED, never
-- deleted: status-history rows keep pointing at their legacy ids and stay
-- interpretable. Live applications at retired statuses are remapped to their
-- canonical equivalents. REFUSED stays inactive-legacy (from 0005).
--
-- Adds optional EN/FR/AR display labels (name_fr / name_ar) so SUPER_ADMIN
-- can edit localized labels from configuration; the EN label stays in
-- `name`. Everything is idempotent-safe.

/* 1. Localized label columns (nullable; EN remains `name`). */
alter table statuses add column if not exists name_fr text;
alter table statuses add column if not exists name_ar text;

/* 2. Canonical status set with localized default labels + ordering. */
insert into statuses (code, name, name_fr, name_ar, description, sort_order, is_terminal, is_draft, active)
values
  ('DRAFT', 'Draft', 'Brouillon', 'مسودة', 'Application being prepared.', 10, false, true, true),
  ('SUBMITTED', 'Submitted', 'Soumis', 'مقدَّم', 'Submitted by the agency; wallet debited.', 20, false, false, true),
  ('DOCUMENTS_CHECKING', 'Documents Checking', 'Vérification des documents', 'فحص المستندات', 'Staff is checking the submitted documents.', 30, false, false, true),
  ('DOCUMENTS_REQUESTED', 'Documents Requested', 'Documents demandés', 'مستندات مطلوبة', 'Staff requested missing or corrected documents.', 40, false, false, true),
  ('IN_PROCESS', 'In Process', 'En cours', 'قيد المعالجة', 'Actively processed by the operations team.', 50, false, false, true),
  ('EMBASSY_SENT', 'Sent to Embassy', 'Envoyé à l''ambassade', 'أُرسل إلى السفارة', 'Optional: file handed to the embassy.', 55, false, false, true),
  ('APPROVED', 'Approved', 'Approuvé', 'مقبول', 'Final approval — visa issued, decision document attached.', 80, true, false, true),
  ('REJECTED', 'Rejected', 'Refusé', 'مرفوض', 'Final rejection — refusal letter attached.', 85, true, false, true),
  ('CANCELLED', 'Cancelled', 'Annulé', 'ملغى', 'Cancelled before processing completed.', 90, true, false, true)
on conflict (code) do
update
  set name = excluded.name,
      name_fr = excluded.name_fr,
      name_ar = excluded.name_ar,
      description = excluded.description,
      sort_order = excluded.sort_order,
      is_terminal = excluded.is_terminal,
      is_draft = excluded.is_draft,
      active = true;

/* 3. Inspect retired-status usage before touching anything. */
do $$
declare
  v_code text;
  sid uuid;
  n_apps integer;
  n_hist integer;
begin
  foreach v_code in array array[
    'UNDER_REVIEW','DOCUMENTS_REQUIRED','PROCESSING','EMBASSY_SUBMISSION','AWAITING_DECISION','COMPLETED'
  ] loop
    select id into sid from statuses where code = v_code;
    if sid is null then
      raise notice '0006: legacy status % not present — skipping', v_code;
      continue;
    end if;
    select count(*) into n_apps from applications where status_id = sid;
    select count(*) into n_hist from application_status_history h
      where h.from_status_id = sid or h.to_status_id = sid;
    raise notice '0006: legacy status % — % live applications, % history references (history preserved)', v_code, n_apps, n_hist;
  end loop;
end $$;

/* 4. Remap live applications at retired statuses to the canonical equivalents. */
do $$
declare
  mapping constant text[] := array[
    'UNDER_REVIEW=DOCUMENTS_CHECKING',
    'DOCUMENTS_REQUIRED=DOCUMENTS_REQUESTED',
    'PROCESSING=IN_PROCESS',
    'EMBASSY_SUBMISSION=EMBASSY_SENT',
    'AWAITING_DECISION=IN_PROCESS',
    'COMPLETED=APPROVED'
  ];
  pair text;
  from_code text;
  to_code text;
  moved integer;
begin
  foreach pair in array mapping loop
    from_code := split_part(pair, '=', 1);
    to_code := split_part(pair, '=', 2);
    with upd as (
      update applications
         set status_id = (select id from statuses where code = to_code)
       where status_id = (select id from statuses where code = from_code)
       returning id
    )
    select count(*) into moved from upd;
    raise notice '0006: remapped % live applications % -> %', moved, from_code, to_code;
  end loop;
end $$;

/* 5. Drop every transition edge that references a retired status (both directions). */
delete from status_transitions
using statuses f, statuses t
where (status_transitions.from_status_id = f.id and f.code in
       ('UNDER_REVIEW','DOCUMENTS_REQUIRED','PROCESSING','EMBASSY_SUBMISSION','AWAITING_DECISION','COMPLETED'))
   or (status_transitions.to_status_id = t.id and t.code in
       ('UNDER_REVIEW','DOCUMENTS_REQUIRED','PROCESSING','EMBASSY_SUBMISSION','AWAITING_DECISION','COMPLETED'));

/* 6. Retire (deactivate) the obsolete statuses — history stays interpretable. */
update statuses
   set active = false,
       name_fr = coalesce(name_fr, initcap(name)),
       name_ar = coalesce(name_ar, name)
 where code in ('UNDER_REVIEW','DOCUMENTS_REQUIRED','PROCESSING','EMBASSY_SUBMISSION','AWAITING_DECISION','COMPLETED')
   and active = true;

/* 7. (Re)ensure the canonical transition graph (edges are idempotent). */
insert into status_transitions (from_status_id, to_status_id, scope)
select f.id, t.id, sval.scope
from (
  values
    -- agency path
    ('DRAFT',              'SUBMITTED',          'BOTH'),
    ('DRAFT',              'CANCELLED',          'AGENCY'),
    -- staff path (existing cancellation capability preserved)
    ('SUBMITTED',          'CANCELLED',          'STAFF'),
    ('SUBMITTED',          'DOCUMENTS_CHECKING', 'STAFF'),
    ('DOCUMENTS_CHECKING', 'DOCUMENTS_REQUESTED','STAFF'),
    ('DOCUMENTS_CHECKING', 'IN_PROCESS',         'STAFF'),
    ('DOCUMENTS_REQUESTED','DOCUMENTS_CHECKING', 'STAFF'),
    ('IN_PROCESS',         'EMBASSY_SENT',       'STAFF'),
    -- final outcomes (recorded ONLY via the dedicated decision workflow;
    -- these edges document the valid graph, the transition service and UI
    -- never offer APPROVED/REJECTED as routine changes)
    ('IN_PROCESS',         'APPROVED',           'STAFF'),
    ('IN_PROCESS',         'REJECTED',           'STAFF'),
    ('EMBASSY_SENT',       'APPROVED',           'STAFF'),
    ('EMBASSY_SENT',       'REJECTED',           'STAFF')
) as sval(frm, too, scope)
join statuses f on f.code = sval.frm
join statuses t on t.code = sval.too
on conflict (from_status_id, to_status_id) do
update set scope = excluded.scope;
