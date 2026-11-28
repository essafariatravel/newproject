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
