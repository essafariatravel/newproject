# Phase II-C — Document Intelligence 1.0
Production baseline verified: 98a237e6f16a15ff34efa10b4cb83c650a8024d2, deployment EoKf8uCUi63iF8D1g8twzWYxFaaU shown Production, Current, Ready and assigned visa.essafariavoyages.com. Branch codex/phase2c-document-intelligence-20261126.
## Architecture
- All analysis local to browser. No added network endpoint, external OCR service, persistent storage or database migration. UI enabled only for this Vercel Preview. Existing submit API, quota, checklist, wallet and original files remain unchanged.
- Passport assistant (step 1): experimental native TextDetector when available; manual TD3 MRZ fallback, all check digits checked, explicit human confirmation before applying name/nationality. ICAO country map intentionally conservative, unknown nationality requires manual entry. MRZ is not proof of authenticity. Expiry century must be confirmed manually; only current name and nationality fields applied, no new applicant data persisted.
- Validity: calendar days relative to departure when valid and future, otherwise Algeria today. No invented visa-specific 6-month rule.
- Step 2: SHA-256 local file content comparison (up to 60 bounded 2 MB files), warnings only; weak file-key cache. No cross-agency or historical comparison.
- Image quality/photo: local downsampled brightness, contrast, Laplacian variance, dimensions and ratio; heuristics only, no biometric/face/background assessment. Browser JPEG/PNG/WebP only; PDF/Office not analyzed.
- Scanner: manual quarter-turn and uniform crop, local JPEG/PDF copy using existing pdf-lib; explicit export, no automatic replacement. No perspective detection, OCR enhancement, automatic alterations or authenticity claim. Original untouched. Copy size displayed, upload limit remains 2 MB.
- Native OCR availability varies and recognition quality unqualified; next iteration needs a pinned offline OCR engine/worker, locally hosted language assets, real synthetic fixture and device tests, no paid API. No dependency changes now.
## Verification
New unit tests for TD3, dates, signals and duplicates; branch guard disables migrations/seed. Actual Vercel build and browser FR/EN/AR/mobile must be verified. No real passports used in tests. Production remains unchanged. No new paid service; normal build consumption not measured.

## R02 — Native OCR hardening (Preview only)
- Two bounded native detection passes (original and lower-page crop), 12-second detection budget. Complete TD3 pairs only; checksum verification, duplicate reading collapse, conflicting verified readings rejected. No guessed OCR characters. Manual entry remains available and human confirmation remains mandatory.
- Native TextDetector still depends on the browser. Offline portable OCR engine and language assets are not included or claimed in R02; they require dependency review and device qualification.
- Integrate the exact published Document Viewer hotfix 78074f0 into this Preview branch only to prevent future regressions. No migration or Production deployment.

## R03 — Manual perspective scanner
- Four-corner projective rectification, convexity validation, bounded sampling, accessible sliders and localized controls. Explicit JPEG/PDF copy; rotation and crop retained. No source rewrite. No automatic edge detection or biometric compliance claims.

## R04/R05 — Photo review and UX
- Reference framing ratios explicitly chosen by operator; no inferred country or visa requirements. Visual manual checklist, original image, ratio difference, no biometric verdict. MRZ expiry mismatch warning before validity display. Focus-visible and touch-target adjustments. No image retouch or file replacement.
- Remaining qualification: universal packaged OCR, face/background measurement if explicitly approved, automated edge detection if needed, authenticated FR/EN/AR/mobile flow. Do not label unqualified functions complete.

## R02 portable OCR implementation — qualification pending
- Preview-only build fetches exact SHA-512-pinned Tesseract.js 6.0.1, core 6.1.2 and English data 1.0.0 archives from npm; no install hooks, no new application dependency, only allowlisted asset extraction. Native first, portable LSTM fallback for lower passport MRZ, same-origin worker/core/model, no IndexedDB caching, bounded worker, no API. Build fails closed if archive or assets cannot be verified.
- Browser recognition and device qualification still required; portable implementation is not a claim of recognition accuracy or support for every passport format. No Production activation.
