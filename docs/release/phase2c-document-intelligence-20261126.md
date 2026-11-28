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

## R08 — portable local face detection
Preview build pins source files to upstream git blob hashes and sizes. Same-origin lazy module, CPU backend, TinyFaceDetector only, no identity matching, descriptors, age, gender or emotion, no runtime CDN or client upload. Native detection remains first choice. Clearly landscape images already flagged do not invoke face inference. Model inference in the actual browser must be qualified before Production. The model is approximate and cannot guarantee a document type or consular acceptance.

## R09 — mandatory internal seven-month rule and visible reports
Both calendars share the existing departure date styling. Expiry mandatory in the Preview wizard, seven calendar months (month-end clamping) from future departure or today; no warning override. Same rule checked before final API submission on this Preview branch, preserving committed idempotent retries. Dates are self-reported and not extracted from documents or persisted. Each selected file shows automatic analysis status, resolution and available quality/face signals, including partial/unavailable checks; no claim of consular approval. No OCR or scanner.

## R10 — application-date policy and visual classification
Seven calendar months exclusively from Algeria current application date; departure does not influence validity. Local visual classification uses detected face geometry and repeated horizontal texture bands (no OCR), all image assignments including bank/passport/other. Reports show probable portrait/document/uncertain separately from technical quality. Uncertain classifications are explicit, never treated as confirmed. PDF/DOC content classification remains unavailable; no new external model or biometric identity matching. Synthetic tests only; real image accuracy remains to be qualified.

## R11 — World Class finishing
Local PDF.js 6.5.438 release, SHA-256-pinned, same-origin worker, no PDF scripting or external URLs, up to four representative pages per file, 25s budget, password/invalid/blank/repeated/partial checks. No OCR; document subtype/authenticity not proven. Distinguish content classification and quality; conservative face-region sharpness, landscape alone is not proof of a document. Compact date and detailed report, explicit partial/invalid states, direct per-piece corrections and final review. Cache and selected-document priority plus yielding between files; PDF parsing worker, image analysis still browser main thread with bounded sizes. Passport date remains self-reported, not persisted; Staff persistence needs separate data-model approval. Actual browser render/accuracy and mobile tests required.
