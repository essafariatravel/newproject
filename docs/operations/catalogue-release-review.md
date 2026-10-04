# Owner catalogue acceptance and classified cleanup

No hosted catalogue correction or cleanup was executed in this continuation.
The 2026-10-03 read-only Preview check still requires owner classification of
the real launch catalogue. A previous Türkiye/IR mismatch is absent; absence
does not prove a correction by this candidate.

Before acceptance, the owner must review the Settings catalogue readiness
inventory and provide the exact retained country, category, visa type and
requirement UUIDs. For each retained programme approve its stable code,
destination ISO code (Türkiye is TR), EN/FR/AR name and instructions, DZD fee,
processing range, required documents, embassy applicability and publication
state. Classify remaining records as historical/test data explicitly. Do not
guess a country from its display name or delete referenced historical rows.

The reset manifest can preserve exact classified UUIDs for countries,
visa_categories, visa_types and visa_requirements. It verifies dependencies,
approved system records, complete encrypted backup and an actual isolated
restore. Unselected rows remain in the immutable archive. Existing application
snapshots and financial history are never edited by catalogue acceptance.

Publish real translations through the existing configuration editor. Keep an
unapproved programme unpublished. Run the same read-only readiness inventory
again and accept only the owner-reviewed launch set. A clean inventory is
technical evidence; the owner must still approve the commercial facts.

The read-only hosted check on 2026-10-04 confirms the migration ledger through
0028_file_identity_hardening.sql, including legal/privacy, function privileges
and permanent file identity. This continuation appends reconciliation as
0029_legacy_reconciliation.sql, 0030_reconciliation_api_lockdown.sql and
0031_reconciliation_event_sequence_repair.sql. It preserves the already-applied
migration names and bytes. Obtain a fresh verified backup/isolated restore and
approve the exact isolated Preview target before applying the new migrations.
