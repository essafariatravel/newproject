# ESSAFARIA VISA OS — SEO & Indexation Safety Gate

Implementation report — 2026-10-03

## Status

- Repository: `essafariatravel/newproject`
- Implementation branch: `seo/indexation-safety-gate-2026-10-03`
- Hardening base incorporated: `observability/preprod-gate-hardening-2026-10-03`
- Hardening base SHA: `580ccc97d86bcdebfac505c9cf822616b7fc0cb3`
- Production changes: **none**
- Database migrations/seeding: **none**
- Business workflow/database logic changes: **none**
- Privacy hardening: **agency-logo endpoint changed from public-by-UUID to authenticated tenant/permission-scoped access**
- Deployment performed by this gate: **none**

The SEO branch is currently ahead of the hardening branch and not behind it.

## Executive result

The application now uses a strict search-visibility model:

1. Only a small intentional public marketing allowlist is indexable in Production.
2. Admin, Agency Portal, auth/account utility pages, token routes, operational catalogue redirects, legal drafts/unapproved legal surfaces, APIs and 404s are non-indexable.
3. Every non-Production Vercel environment receives a global `X-Robots-Tag: noindex, nofollow, noarchive`.
4. Preview builds on `seo/**` are explicitly forbidden from performing automatic database migrations, seeding or bootstrap verification.
5. Canonicals are emitted only for intentional public pages and only in Production.
6. The sitemap is generated only in Production and contains only intentional public pages.
7. No hreflang is emitted because the current locale architecture is cookie/query based rather than stable locale-specific URLs.
8. Structured data is deliberately limited to a minimal public Organization object on the homepage.
9. No FAQ structured data was added.
10. The root layout no longer injects a marketing description into private product surfaces.

## Production-indexable public allowlist

The Production sitemap contains only:

- `/`
- `/b2b`
- `/about`
- `/contact`
- `/faq`

The following are deliberately excluded from the sitemap and carry noindex controls:

- `/login`
- `/forgot-password`
- `/change-password`
- `/agency/register`
- `/agency/register/success`
- `/activate/[token]`
- `/reset-access/[token]`
- `/agency/verification/[token]`
- `/countries`
- `/visas`
- `/privacy`
- `/terms`
- all `/admin/**`
- all `/portal/**`
- all `/api/**`
- 404/not-found output

The public `/countries` and `/visas` routes currently redirect to login. They remain explicitly noindex so the operational visa catalogue cannot become a search-indexable data source accidentally.

## Metadata architecture

Machine-readable route policy: `src/lib/seo-manifest.ts`

This manifest is now the single source of truth for every `(public)` route, including:

- route path/pattern;
- `indexable` vs `noindex` classification;
- sitemap eligibility;
- HTTP header source pattern;
- `no-store` requirement;
- `no-referrer` requirement.

The sitemap, `next.config.ts` route headers, static tests and runtime verifier all consume this policy instead of maintaining separate hand-written route lists.

Central metadata module: `src/lib/seo.ts`

It owns:

- canonical Production origin: `https://visa.essafariavoyages.com`
- public page metadata copy in EN / FR / AR
- canonical generation
- Production-only sitemap generation
- robots generation
- noindex metadata builder
- Open Graph / Twitter metadata
- minimal Organization JSON-LD
- explicit environment eligibility logic

Indexing is allowed only when:

`VERCEL === "1" && VERCEL_ENV === "production"`

All other runtime environments are treated as non-indexable.

## International SEO decision

No hreflang is emitted.

Reason: the current application chooses EN / FR / AR through a cookie and optional query parameter rather than separate stable crawlable locale URLs. Publishing hreflang under that architecture would create contradictory or unstable signals.

Future hreflang work should start only after introducing stable locale URLs such as path-based locale routes.

## Public content improvements

Added a public multilingual FAQ page at `/faq`.

The page provides general agency-facing information about:

- intended B2B audience;
- agency onboarding;
- visa request submission;
- secure document submission;
- request follow-up;
- separation between public information and partner-only operational/commercial information.

No visa-country catalogue, partner rates, dossier data or private operational information is exposed.

## Structured data

Homepage JSON-LD contains only:

- schema.org Organization;
- ESSAFARIA name;
- Production site URL;
- public logo URL.

No customer data, agency data, offers, visa inventory, ratings, FAQ schema or operational records are included.

## Social metadata

A pre-existing public image is reused for Open Graph rather than inventing a new brand asset:

`/images/essafaria-airport-hero.webp`

Verified intrinsic dimensions:

- 1916 × 821
- approximately 56 KB

Those real dimensions are now declared in metadata.

A dedicated 1200 × 630 social card may be produced later as a P2 brand enhancement; it is not required for the safety gate.

## Public image accessibility / on-page SEO

The main travel image used by the homepage and B2B page was inspected.

Changes:

- replaced empty alt text with localized descriptive alt copy;
- corrected intrinsic dimensions to the verified 1672 × 941 asset size;
- retained one H1 per intentional indexable page.

Static audit result for the five indexable pages:

- exactly one H1 on each page;
- every rendered image has an alt attribute;
- homepage and B2B imagery now carry meaningful localized alt text.

## HTTP-level indexation controls

`next.config.ts` now provides defense in depth.

Outside Production:

- every route receives `X-Robots-Tag: noindex, nofollow, noarchive`.

Always non-indexable:

- `/admin/**`
- `/portal/**`
- `/api/**`
- auth/account utility routes
- token-bearing account/verification routes
- operational catalogue redirects
- legal surfaces currently held outside indexing

Sensitive auth/token routes also receive cache controls, and token-bearing routes receive:

- `Cache-Control: no-store, max-age=0`
- `Referrer-Policy: no-referrer`

The route-level metadata remains in place as a second layer.

## robots.txt strategy

Production robots output advertises the public sitemap.

Non-Production robots output does not advertise a sitemap.

The non-Production robots policy intentionally does not use robots.txt as a security boundary. Crawlers must be able to fetch the response and observe the stronger `noindex` response headers/meta. Authentication and authorization remain the actual access-control boundary.

## Sitemap strategy

Production only.

No entries are generated for:

- authenticated product surfaces;
- account/auth utility pages;
- dynamic IDs/tokens;
- operational catalogue redirects;
- query variants;
- legal pages not explicitly approved for search;
- API routes.

Outside Production the sitemap generator returns no URLs.

## Preview / database safety

The build policy now protects every `seo/**` branch.

For Vercel Preview builds on these branches:

- no automatic migrations;
- no demo seed;
- no bootstrap DB verification that could mutate state.

This was added before the SEO implementation so an automatic Preview cannot turn this gate into a database change.

## Private API / stored-resource audit

The gate now statically audits the private download/export surfaces:

- Admin application export;
- Admin reports export;
- Agency wallet export;
- Agency wallet statement;
- private visa documents;
- agency-registration documents;
- wallet top-up proof/receipt;
- token-based registration follow-up uploads.

The test contract requires authentication/authorization and `no-store` for private payloads, and attachment disposition where a document/export is returned.

### Agency logo privacy correction

`/api/agencies/[id]/logo` was previously marked “Public by design”.

Actual usage was checked:

- Agency Portal uses it while authenticated;
- Staff/Admin uses it while authenticated;
- the public website uses `/api/branding/logo`, not the agency-specific endpoint.

The agency-specific endpoint is therefore now private:

- authentication required;
- agency users can request only their own agency logo;
- Staff requires `agencies.view`;
- cross-tenant/unauthorized requests return a non-disclosing 404;
- response cache policy is now `private, no-store`.

The platform branding logo remains intentionally public because it is used by the public site.

## Automated SEO gate

Two operational commands are now available.

### Static gate

```bash
npm run verify:seo
```

This single command runs:

- TypeScript typecheck;
- ESLint;
- SEO/indexation contracts;
- route-manifest consistency;
- private-resource security contracts;
- public-link audit;
- public-media/performance guardrails;
- repository-wide metadata safety checks;
- Preview database-write guard tests.

It prints either:

`SEO_STATIC_GATE_PASS`

or:

`SEO_STATIC_GATE_FAIL`

### Runtime HTTP gate

```bash
SEO_VERIFY_BASE_URL=<safe-preview-or-local-url> \
SEO_VERIFY_MODE=preview \
npm run verify:seo:runtime
```

For a local Production-behavior simulation:

```bash
SEO_VERIFY_BASE_URL=http://127.0.0.1:3000 \
SEO_VERIFY_MODE=production-sim \
npm run verify:seo:runtime
```

The runtime verifier is read-only and checks:

- all five indexable public pages;
- Preview global noindex;
- absence of Preview canonicals and `og:url`;
- canonical/OG correctness in Production-sim;
- sitemap exactness;
- robots behavior;
- representative Auth/Admin/Portal/API noindex behavior;
- true 404 + noindex;
- absence of localhost/Preview absolute metadata hosts.

It refuses to probe the real Production host unless `SEO_VERIFY_ALLOW_PRODUCTION=1` is explicitly supplied.

## Regression tests added

`tests/seo-indexation.test.ts`

Covers:

- environment eligibility;
- Production-only canonicals;
- no hreflang under the current locale architecture;
- private metadata shape;
- exact sitemap allowlist;
- no sitemap outside Production;
- Production robots sitemap advertisement;
- minimal structured data;
- deterministic canonical URLs.

`tests/seo-route-policy.test.ts`

Covers:

- Admin and Portal layouts remain noindex;
- all public routes must be explicitly classified as either indexable or noindex;
- auth/account routes remain noindex;
- token routes retain no-referrer;
- only intentional public pages use the public SEO builder;
- private descendants may not add public SEO metadata, `index: true`, canonical, Open Graph, JSON-LD or dynamic metadata without explicit review;
- root metadata stays brand-safe rather than marketing-heavy;
- operational catalogue redirects remain noindex.

Additional suites now include:

- `tests/seo-private-resources.test.ts` — authenticated/private file and export policy;
- `tests/seo-public-links.test.ts` — public navigation/link integrity and no direct private-surface linking;
- `tests/seo-public-performance.test.ts` — intrinsic image sizing, payload budgets, high-priority media limits and no autoplay/base64 media;
- `tests/seo-metadata-safety.test.ts` — centralization of canonical/Open Graph, root-only `metadataBase`, homepage-only JSON-LD and no Preview/local absolute metadata hosts.

`tests/build-preview-guard.test.ts`

Extended to prove `seo/**` branches cannot perform automatic database changes during Preview builds.

## Static repository audit completed here

The current branch was inspected directly through GitHub.

Results:

- public pages found: 17;
- indexable public pages: 5;
- explicitly noindex public pages: 12;
- unclassified public pages: **0**;
- Admin/Portal private metadata regression violations: **0**;
- current hardening branch divergence: **0 commits behind**;
- core public literal-link audit: all discovered links resolve to known public/auth utility routes;
- agency-logo public exposure removed; platform-logo public exposure retained intentionally.

The SEO branch incorporates the latest current observability hardening SHA listed above.

## Verification limitation

A deterministic CI/runtime execution could not be completed from this environment for two external reasons:

1. the local execution environment cannot resolve external GitHub DNS, so a local clone/build cannot be performed here;
2. the connected Vercel account surface returned no accessible team, while the GitHub Vercel status reports a platform build-rate-limit failure rather than a code failure.

No test or build result has been fabricated.

## Remaining work for Codex

Only verification remains.

Codex should check out the exact SEO branch and run:

```bash
git checkout seo/indexation-safety-gate-2026-10-03
npm ci --no-audit --no-fund
npm run verify:seo
npm test
npm run build
```

Then run a local Production-behavior simulation without deploying:

```bash
VERCEL=1 VERCEL_ENV=production DATABASE_URL="" ALLOW_DEMO_SEED=false npm run build
VERCEL=1 VERCEL_ENV=production DATABASE_URL="" npm start
```

In a second terminal:

```bash
SEO_VERIFY_BASE_URL=http://127.0.0.1:3000 \
SEO_VERIFY_MODE=production-sim \
npm run verify:seo:runtime
```

For a real safe Preview, run:

```bash
SEO_VERIFY_BASE_URL=<PREVIEW_URL> \
SEO_VERIFY_MODE=preview \
npm run verify:seo:runtime
```

After build success, the automated runtime verifier proves:

- Preview/home response includes global `X-Robots-Tag: noindex, nofollow, noarchive`;
- Preview `/sitemap.xml` exposes no URLs;
- Preview `/robots.txt` advertises no sitemap;
- `/admin/**`, `/portal/**`, `/api/**` remain noindex;
- token routes return noindex + no-store + no-referrer;
- simulated Production `/sitemap.xml` contains exactly the five allowlisted URLs;
- simulated Production public pages contain their canonical Production URLs;
- no private page emits canonical, Open Graph or JSON-LD;
- homepage Organization JSON-LD contains only the intentionally public organization fields.

If all commands and runtime checks pass, no further SEO/indexation implementation should be necessary for this gate.

## Explicit non-goals / deferred work

P2 only:

- dedicated 1200 × 630 ESSAFARIA social card;
- stable locale-specific URL architecture;
- hreflang after stable locale URLs exist;
- Search Console submission/inspection;
- public visa/destination catalogue SEO, only after an explicit content-governance decision defining what operational information may be public;
- legal-page indexing only after legal/privacy readiness explicitly approves publication and indexation.

## Release posture

This branch must not be merged or promoted solely on static inspection.

Required release evidence is:

- typecheck PASS;
- lint PASS;
- targeted SEO tests PASS;
- full regression PASS;
- deterministic build PASS;
- safe Preview/local runtime header and sitemap verification PASS.

Production remains untouched until the normal release process explicitly authorizes it.
