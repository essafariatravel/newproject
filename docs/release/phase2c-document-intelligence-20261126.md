# Phase II-C — Document Intelligence (revised scope)
Branch: codex/phase2c-document-intelligence-20261126. Preview only.
Owner decision: remove Passport OCR (including manual MRZ assistant, native and WASM engines) and Smart Document Scanner (perspective, rotation, crop and copy export).
Retain:
- Passport validity: manually entered expiry, calendar days at future departure or Algeria today, informational only.
- Document quality: local JPEG/PNG/WebP resolution, sharpness, exposure and contrast signals; no PDF or Office analysis.
- Duplicate documents: local SHA-256 comparison of up to 60 files within the current request, maximum 2 MB each; no automatic deletion or cross-agency lookup.
- Photo review: selected reference proportions and manual checklist; no biometric certification.
- FR/EN/AR interface, original documents untouched, existing upload and download unaffected.
- Existing Preview security settings and previously merged document viewer hotfix retained.
No migrations, dependency changes, external OCR downloads, or Production activation. Automated retained-module assertions run during the protected Preview build. Authenticated browser testing remains necessary.

## R07 — shared document guard
Uses the existing DatePicker, parent-held expiry estimate, automatic file-signature/image-quality inspection for all assigned files, approximate portrait checks, native FaceDetector if supported, SHA-256 and conservative visual difference hash, and persistent warnings at confirmation. Acknowledgement is tied to the exact current result/date/programme. Invalid file signatures or unreadable images prevent progression. PDF/DOC/DOCX signature-only; unsupported face detection is explicitly signalled. No OCR, scanner, external model, consular rule invention, biometric identity matching or migration. Expiry estimate remains local, not persisted. Browser and mobile qualification still required.
