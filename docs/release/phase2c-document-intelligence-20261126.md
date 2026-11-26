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
