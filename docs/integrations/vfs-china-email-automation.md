# ESSAFARIA VISA OS — VFS China Gmail integration (staged design)

## Business decision agreed

ESSAFARIA treats the **official VFS China "Online review completed" certificate**
as a completed B2B service. For a **correctly matched VISA OS application only**:
attach the PDF as the official approval document, transition through the
existing canonical APPROVED workflow, close/freeze processing time, and notify
**only** the owning agency. This is an internal business convention and must not
be described as evidence of a consular visa sticker.

## Mailbox source

- `visa@essafariavoyages.com` is an alias delivered to the connected Gmail
  account `info@essafariavoyages.com`. **Do not create a second mailbox or OAuth
  connection**. Search the connected Gmail account using the recipient alias.
- Source example: `service@visaforchina.org`,
  subject `Online review completed / 线上审核完成`, one PDF certificate attachment.
- Read-only Gmail inspection found genuine-looking messages in that connected
  mailbox. This is not by itself cryptographic authentication.
- A server-side intake adapter must verify Gmail's trusted SPF/DKIM/DMARC
  result, require the exact sender/recipient/subject and validate the PDF's
  actual text, not just its filename.

## Current Production blocker (19 November 2026)

The simple agency new-request form captures only Full Name and Nationality.
In Production, no applicant has a structured passport number; in particular
none of the 20 China requests (10 open) has it. The VFS reference/form number
is also not a structured field. The certificate's *Contact Name* is a contact,
not necessarily the traveler. **Never auto-match by contact name**.

Consequently there is currently NO safe basis to approve existing requests
from inbound certificates. Do not enable the ingestion cron or production API.

## Safe sequence to implement

1. Add a Staff-only, audited binding of VISA OS application ID to the VFS
   application/certificate reference **and the applicant passport number**.
   Expose on the Staff China dossier, not as a new public service.
   Prevent duplicate VFS references across open/closed dossiers.
2. Backfill exact identifiers for existing online China requests where known.
   Unlinked requests stay untouched. Do not create an application for an
   unmatched/offline message.
3. Add a Gmail intake job for the connected mailbox. Search:
   `to:visa@essafariavoyages.com from:service@visaforchina.org subject:"Online review completed" has:attachment`.
   Choose Google Apps Script time-driven scan or Gmail API subscription, with
   a durable retry cursor and least-privilege authorization. No hidden costs.
4. Authenticate source; require one PDF <= 2MB with valid magic bytes and
   extracted text showing the exact reference/form/passport. The pure policy
   lives in `src/lib/vfs-china-certificate.ts`; tests use synthetic identities.
5. Resolve matching **only** against the exact Staff-bound reference AND
   passport in a single, non-terminal eligible China application. If missing,
   duplicate or conflicting, IGNORE_OFFLINE or REVIEW_REQUIRED — never approve.
6. Finalize using a purpose-limited service actor with a complete audit trail
   and the existing decision transaction/transition and approved-document
   policy. Preserve document integrity, notification agency scoping and
   processing-duration freeze. Idempotency MUST use Gmail message ID + PDF
   SHA-256 + VFS reference with a unique DB constraint; locking must avoid
   duplicate approvals from concurrent webhooks.
7. Run staged tests (success, offline, duplicate, mismatched passport, wrong
   agency, expired/decided dossier, malicious/spoofed source, malformed PDF,
   crash/retry, storage failure, MFA/RBAC regression). Publish gated by an
   explicit VFS_CHINA_AUTOMATION_ENABLED=false-by-default flag and approved
   secret/configuration; enable after safe end-to-end tests, with a kill switch.

## Platform boundaries

- Gmail connector in ChatGPT does **not** automatically give Vercel server code
  a Gmail OAuth token. A separate, authorized server-side Gmail integration or
  Apps Script install must be configured by an account owner.
- Do not accept `gmailDmarcVerified` supplied by an external JSON client
  without independent authentication; it is a private trusted-input fact only.
- Do not store raw PDF text, full passport numbers, email content, or secrets in
  logs; retain only necessary audit hashes/IDs and secured official PDF.
- No Production DB migration, automatic final decision or external webhook is
  activated by this initial matching-policy PR.
