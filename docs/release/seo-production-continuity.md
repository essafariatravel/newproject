# SEO production continuity — 2026-11-26

The SEO resource release of 2026-11-24 was lost when a divergent product branch was deployed. The production recovery must retain the current Document Viewer hotfix and every existing operational feature.

Before any later production deployment, resolve the live custom domain to its actual Vercel commit and ensure the release contains that commit or explicitly reconciles its changes. Run the SEO qualification tests against the exact candidate, then inspect all 18 public URLs and sitemap on the real production domain after release. Do not use an old main or preview branch as the production base. Preserve /resources, /fr/resources, /ar/resources, reciprocal language metadata and all private noindex rules. The number of indexable public URLs may only change with a reviewed scope change.

Commands: npm run verify:seo:contracts; npm run typecheck; npm run lint. For HTTP qualification use npm run verify:seo:runtime with SEO_VERIFY_BASE_URL and SEO_VERIFY_MODE=production-sim (set SEO_VERIFY_ALLOW_PRODUCTION=1 only for an authorized read-only live check). If the deployment is a preview, use SEO_VERIFY_MODE=preview instead. A build passing alone is not evidence of successful search indexing.
