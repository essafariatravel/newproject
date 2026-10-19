# ESSAFARIA VISA OS — Future Codex Legal/Privacy Verification Handoff

Use this only if a later Owner/Legal decision changes requirements, or for final verification after integration. Do not use Codex to recreate the current Legal/Privacy implementation.

## Authoritative starting point

Repository: \`essafariatravel/newproject\`

Start from the then-current:
\`preprod/essafaria-final-hardening\`

The repository and database-compatible implementation are the source of truth.

## Mission

Verify only the delta introduced by newly approved Owner/Legal decisions or final release integration.

Do not:
- invent Privacy Notice or Terms text;
- invent legal bases, statutory retention periods or notification deadlines;
- infer controller/processor/vendor legal roles;
- add analytics/marketing tracking;
- add a cosmetic cookie banner;
- reopen KYC/document collection in the first-contact agency form;
- weaken tenant isolation, log redaction or private storage;
- UPDATE/DELETE immutable legal, wallet or audit history;
- apply pending migrations to Production without explicit Production release authorization.

## First checks

1. Confirm branch, exact HEAD, git status and diff.
2. Read:
   - \`docs/privacy/LEGAL_PRIVACY_GATE_REPORT_2026-10-03.md\`
   - \`docs/privacy/pilot-privacy-readiness.md\`
   - \`docs/privacy/data-governance-register.md\`
   - \`docs/privacy/owner-legal-handoff.md\`
   - \`docs/privacy/retention-decision-register.md\`
   - \`docs/privacy/browser-storage-inventory.md\`
   - \`docs/privacy/vendor-inventory.md\`
   - \`docs/privacy/privacy-request-incident-runbook.md\`
3. Identify only requirements changed by an approved decision.
4. Classify each requested change:
   - EXISTING
   - PARTIAL
   - MISSING
   - OWNER INPUT
   - LEGAL REVIEW
   - EXTERNAL CONFIG.
5. Implement only verified technical gaps.

## Required verification after any technical change

Run the repository's normal deterministic gate and preserve:
- typecheck;
- lint;
- privacy/legal targeted guards;
- migration safety;
- full deterministic suite;
- Next.js build;
- local built-runtime privacy smoke.

For Preview:
- verify the exact deployment SHA;
- confirm Preview uses \`visa_os_preview\`, never \`visa_os\`;
- inspect cookies/storage/network requests;
- confirm no unexpected tracker;
- verify legal pages and registration behavior;
- verify Staff consent evidence.

Production remains untouched unless a separate explicit Production release authorization is provided.

## Final report

Return:
A. branch / exact HEAD  
B. approved decision/change being implemented  
C. existing implementation reused  
D. files changed  
E. migrations changed/applied by environment  
F. legal-content/versioning result  
G. acceptance evidence result  
H. cookie/storage/tracking result  
I. retention/lifecycle result  
J. privacy-request/export result if applicable  
K. vendor/external-config result  
L. tests + exact counts  
M. Preview runtime result  
N. Production untouched confirmation or separately authorized Production actions  
O. remaining Owner/Legal/external blockers  
P. verdict: PASS / PARTIAL / FAIL

If no approved requirement changed and all gates remain green, make no code change.
