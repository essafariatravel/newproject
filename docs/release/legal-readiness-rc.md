# Legal and retention release candidate

This candidate is local preparation. It has not changed a hosted database, a
deployment, the owner account, MFA enforcement, `main`, or a Production guard.
The independent clean Preview remains a separate, explicitly Preview-only release.

## Legal review and publication

- `/admin/legal-review` requires a current SUPER_ADMIN with `cms.manage`. It is
  available in local development/test or an explicit Preview schema, never Production.
- `LEGAL_REVIEW_PACK_PATH` points to a private, absolute server-side file outside
  Git. The parser accepts only the supplied REVIEW v1.0 structure: FR/EN/AR,
  ten sections and 66 stable clause IDs per language. Drafts cannot become a
  published version through this loader. No supplied legal text is bundled in Git.
- A local filesystem path is not a hosted distribution mechanism. Hosted private
  draft delivery is not qualified. Do not include the pack in a public source or
  build artifact to work around that limit.
- Existing approved, effective immutable versions drive `/terms`, `/privacy`,
  `/legal/legal-notice`, `/legal/cookies`, and `/legal/commercial`. Missing approved
  versions show an unavailable notice; private drafts are never a fallback.
- The source pack still needs counsel approval, resolved reservations, verified
  company facts and an approved effective date. The DPA remains a working template,
  with no signing action. No approval is inferred from deployment or an upload.

## Acceptance evidence

Public partnership registration retains its existing explicit Terms checkbox and
privacy acknowledgement. Canonical version IDs, versions, effective times and
content digests are read under the same publication locks as the atomic receipt
and audit. Raw text, traveller data, names, email addresses and IPs are excluded
from these new receipt fields.

`/legal/acceptances` is authenticated and offers only currently published content
applicable to the account. Checkboxes start unchecked. The service revalidates the
current account/tenant/role and effective version, and writes an immutable receipt
plus minimal audit in one transaction. Retries do not duplicate receipts. A new
version or locale has a different receipt; a query-string success flag is not proof.

| Event | Available signer | Method |
| --- | --- | --- |
| `terms_b2b` | Active agency user | Explicit checkbox |
| `privacy_b2b` | Active authenticated account | Acknowledgement, separate from contractual consent |
| `commercial_b2b` | Active agency administrator | Explicit checkbox |
| `staff_confidentiality` | Active staff account | Explicit checkbox |
| `traveller_submission_declaration` | Not yet activated | Always blocked pending the approved effective-submission definition |

The signatory scope and when re-acceptance must block an operation remain legal
release decisions. The account page does **not** silently impose new login or visa
submission gates. Nor does it claim an agency administrator is legally authorised
to bind a company merely because that technical role exists. Submission privacy
copy and its transactional acknowledgement must be connected to the approved
business trigger before Go-Live; a generic checkbox must not invent that trigger.

## Document retention

Migration 0034 and the dormant service implement a locally qualified 120 UTC
calendar-day anniversary after a proven genuine APPROVED/REJECTED visa decision.
There is no scheduler or hosted purge route. The policy is disabled by default;
execution cannot be enabled for a hosted database by environment variables.

Execution is confined to explicit disposable `localhost:5434/essafaria_test/public`
configuration **and** actual PostgreSQL identity checks. Legal review tied to the
current decision, absence of a legal hold, complete storage coverage approval,
restore reconciliation approval and a reviewed inventory manifest are mandatory.
Reopened/active cases, open requests, unknown storage columns, externally stored
copies, shared finance/logo references and protected reconciliation evidence block
deletion. Original/versioned documents and derived/orphaned case-prefix blobs are
removed atomically; finance, applications, history, audits and backups are retained.

An immutable receipt explains a qualified deliberate absence to integrity and
reconciliation scans. It never makes a document present, completes a checklist,
authorises a final visa decision or marks a missing original as restored. Restored
copies require a new reconciliation and cannot be deleted using an old receipt.

## Destination gates

Migrations 0034/0035 are staged under `migrations/candidates`, outside automatic
migration discovery. Their suites explicitly apply and then remove this candidate
DDL only inside the verified disposable localhost fixture. Existing 0033 release
and recovery qualifications remain unchanged. They were tested only locally.
They are outside the existing Production release scope. Do not broaden that scope,
create `PROD_GO`, import drafts, run migrations, activate purge, or publish this
branch without the separate applicable approval and verified recovery conditions.
Automatic Vercel deployment and build-time migrations/seeds are disabled for this RC.

The existing isolated Preview connection and MFA metadata remain pinned to their
approved branch. This candidate cannot be deployed against that database unchanged;
an exact-SHA Preview scope must explicitly qualify any additional branch. No fake
Vercel metadata or broader Production MFA exemption is acceptable.

Before commercial Go-Live: qualify the actual hosting contract and storage capacity,
approve legal texts/signers/submission semantics, verify current independent
Production recovery, resolve release-baseline drift, and prove owner login/recovery
before retiring existing administrators. Do not promote the Preview-locked release.
