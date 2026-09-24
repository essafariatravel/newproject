-- 0016_document_type_audience.sql
-- Forward-only, non-destructive, idempotent.
--
-- WHY: document types fall into two audiences.
--   * agency-uploadable  — items on a checklist the AGENCY must provide
--     (passport scan, bank statement, insurance…).
--   * staff-issued       — artifacts ESSAFARIA or the authority produces
--     (the issued visa / approval decision).
-- Without this distinction staff could "request an additional document" of a
-- staff-issued type, which asked an agency to upload the authority's own
-- decision document — nonsense for the agency and an integrity hole in the
-- document model (rendered-audit finding, §documents).
--
-- Existing rows default to agency-uploadable (true) so nothing changes for the
-- current catalogue; only the decision document is re-classified.

alter table document_types
  add column if not exists agency_uploadable boolean not null default true;

comment on column document_types.agency_uploadable is
  'true = agencies provide this document on a checklist; false = ESSAFARIA/the authority issues it (never requested from an agency).';

update document_types
   set agency_uploadable = false
 where code in ('DECISION_VISA_APPROVAL', 'DECISION_REJECTION')
   and agency_uploadable is distinct from false;
