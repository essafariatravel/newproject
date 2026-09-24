-- 0017_decision_types_audience.sql
-- Forward-only, non-destructive, idempotent.
--
-- 0016 introduced document_types.agency_uploadable and re-classified the issued
-- visa type by exact code. The catalogue also ships 'DECISION_REFUSAL_LETTER'
-- (refusal / rejection letter issued by the authority) — and any future decision
-- artifact — so the rule is expressed by prefix rather than by an enumeration of
-- codes: every DECISION_* document is issued by ESSAFARIA / the authority and can
-- never be requested from, or uploaded by, an agency.

update document_types
   set agency_uploadable = false
 where code like 'DECISION\_%'
   and agency_uploadable is distinct from false;
