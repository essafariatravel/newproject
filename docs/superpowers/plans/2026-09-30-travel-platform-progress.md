# SDD ledger - plan: docs/superpowers/plans/2026-09-30-travel-platform-upgrade.md

Baseline: d0da7f381e1b5cdff5c2f96e1cded768437d2dc4, clean design/essafaria-northstar. Application tree matches origin/main 831607a; only project skill differs. Prior isolated lab remains preserved outside checkout.

Pre-flight: shared AppShell/NavList server/client props stay unchanged; screen refinements consume existing query results. No conflicting business interfaces.

Ruling: continue autonomously with native execution already chosen, without another approval checkpoint - latest user explicitly authorizes actual portal upgrade and Preview; prior no-checkpoint instruction remains applicable - cost if wrong: reversible presentation change on design branch.

Ruling: retain existing branch and add it to the existing Preview database-change guard - current application tree matches main; safeguard prevents migrations/seed on design Preview - cost if wrong: Preview may need separately authorized database preparation, never automatic production work.

## Controlled stabilization scope — 2026-10-01

The accepted audit reclassifies this checkout as a real-portal integration candidate. The current visual implementation is frozen; stabilization does not authorize further design, business-rule or workflow changes.

Agency Home now calls the existing `activeVisaOptions()` catalogue read alongside `agencyDashboard(user.agencyId, user.id)` after the existing authentication guard. The catalogue query implementation is unchanged. It selects active visa/country/category options in DZD for the existing GET destination-to-wizard entry point. No write, API route, server action or schema was added. Home consequently depends on the catalogue read succeeding as well as the agency dashboard read.

The only source correction in this stabilization pass is restoring the existing em-dash translation key on Home. Preview publication is gated on positive verification of non-Production configuration (`visa_os_preview`, not `visa_os`), automated validation and the existing design-branch migration/seed safeguard. No manual or hosted migrations are authorized.
