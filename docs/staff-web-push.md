# ESSAFARIA VISA OS — Staff-only Web Push

## Scope and architecture
- Branch is based on the verified live Production SHA `b9e2abce8a83f96aa0b2ccf6c2db968458d66cd8` (2026-11-16).
- Push opt-in is available to internal `SUPER_ADMIN`, `ADMIN`, `VISA_AGENT`, `ACCOUNTING` with `agency_id IS NULL`. Agency users retain in-app notifications only.
- Browser subscribes with standard Push API; server stores up to 5 endpoints per staff user. Endpoint hashes and Web Push encryption parameters remain restricted to a private application database schema.
- Server never sends passport, traveler name, free-form message or sensitive document text to lock screens.
- Apple iOS 16.4+ requires the PWA to be installed on Home Screen. Chrome/Firefox/desktop browsers supporting Web Push work normally.
- No service worker caching: offline access to private records is NOT enabled.
- Delivery is triggered with Next `after()` after event rows are saved. Failed deliveries do not block application submissions or remove in-app notifications.
- No paid push provider dependency. Provider messages and Vercel/Supabase network usage still count toward ordinary infrastructure limits.

## Before enabling in any environment
1. **Never point a Preview database at Production.** Preview must use `DATABASE_SCHEMA=visa_os_preview`.
2. Apply `migrations/0034_staff_web_push.sql` **only to the isolated Preview database** using existing migration procedure; check for schema drift, run database advisors, keep original data intact.
3. Generate a VAPID P-256 key pair locally and configure these server-only environment secrets privately in Vercel Preview: `WEB_PUSH_VAPID_PRIVATE_KEY` (base64url 32 bytes) and `WEB_PUSH_VAPID_PUBLIC_KEY` (base64url uncompressed 65-byte point). Never use `NEXT_PUBLIC_` for the private key. The public key is returned via a staff-authenticated GET.
4. Verify iPhone install, user gesture and opt-in; run a test push and confirm staff-only database subscriptions; test with agency role that GET/POST/DELETE/test return 403; test invalid Origin and arbitrary push destination; run security and regression suite.
5. Review existing costs and usage before Production migration. No Production configuration, database migration or release without explicit owner approval.

## Generating keys (run locally in a trusted environment)
```bash
node -e "const c=require('node:crypto').createECDH('prime256v1');c.generateKeys();console.log('WEB_PUSH_VAPID_PUBLIC_KEY='+c.getPublicKey().toString('base64url'));console.log('WEB_PUSH_VAPID_PRIVATE_KEY='+c.getPrivateKey().toString('base64url'))"
```
Copy the secret directly to Vercel environment settings; never to GitHub, logs, or chat.

## Additional security and reliability controls
- Staff users can revoke all registered devices in one click. Revocation is server-side and survives an old browser subscription; deactivated user roles receive no events.
- An existing endpoint cannot be claimed by another staff account. The previous owner must revoke the device first.
- Test pushes are limited to 3 per minute per staff account and subscription changes to 12 per hour by the existing atomic DB counter.
- Provider send failures retry once when transient, with bounded batches and aggregate redacted logs. This is **best effort**, not durable at-least-once delivery. In-app events remain authoritative and are preserved.
- Migration 0035 enables RLS and revokes all Data API grants from the push subscription table. Verify the Preview app's Postgres role retains owner/BYPASSRLS access before Production.
- Preview-only simulation is protected by an exact environment/branch/schema guard, staff authentication, same-origin checks and a per-user rate limit. It creates a clearly marked fake notification in the Preview DB and invokes the actual background delivery engine. Never activate in Production.
- Complete a real agency submission in the Preview environment and verify actual business notifications and HTTP 403 agency isolation before Production approval.
- Push deep links exclude all query strings and fragments to avoid personal information appearing in notification metadata.

## Rollback
Disable the `WEB_PUSH_VAPID_*` environment variables. Opt-in stops immediately; private in-app notifications and mail remain unchanged. Database rows can be cleaned after an approved retention assessment.
