# ESSAFARIA VISA OS — isolated capacity qualification approval gate

Updated: 2026-11-09. This document records planning evidence only; it is not evidence that a hosted test has run.

## Owner decisions

- Objective: prove more than 50 simultaneously active users in genuine authenticated B2B workflows, with sequential gates at 10, 25, 50, 75 and 100 virtual users.
- Environment: isolated from Production; no load directed to Production, no live customer records, and no Production deployment or database changes.
- Owner-approved spending ceiling: **USD 20 total**, stated in the ongoing conversation. No additional spend or change of scope is authorized by this note.
- Named Supabase organization: `essafaria travel's projects` (`vercel_icfg_lAKNVL5OfNJRRzKgeAMXr2Ta`).
- Production **read-only identifiers for denial checks**, never workload targets: Supabase `xgetzgixalrsmuvfthpf`; Vercel `prj_0WOxlorbYiljjjBvZ1Cm6M9JmPdp`.
- Source baseline: verified Production Git tree `090badf35e989ed3964cb652b9ed0822bb3b15f8`, isolated worktree branch `codex/isolated-capacity-test-20261109`.

## Live cost quotes (not a guaranteed invoice)

| Option | Supabase quoted rate | Billing / cleanup | Status |
| --- | --- | --- | --- |
| New independent TEST project | USD 10 per month (connector `get_cost`) | Pro projects cannot be paused; must be deleted to stop billing; connector exposes project creation but **not deletion** | **BLOCKED** without a confirmed authenticated deletion method |
| Supabase isolated development branch | USD 0.01344 per hour (connector `get_cost`) | Connector supports `delete_branch`; Supabase docs state branch is separate and starts without Production data | **APPROVED and created** by owner's 2026-11-09 response |

The branch rate corresponds to approximately USD 0.32256 for 24 hours of compute, before possible additional usage and Vercel/generator charges. An alert or manual spreadsheet cannot enforce a hard billing ceiling.

Vercel's connector has a way to create a separate TEST project and obtain a Dashboard deletion link, but no direct connector action to delete the project; ownership of cleanup must be established before creation.

## Approved isolated resource inventory

| Provider | Exact TEST identifier | State at provisioning |
| --- | --- | --- |
| Supabase branch | `eb86eed4-c463-42d5-8dc7-32ce98e3fdbf` | **DELETED** after failed Git publication approval; confirmed absent from branch inventory |
| Supabase branch project ref | `catvumvhpvsujopcvxxy` | **DELETED**, was `with_data=false`; this ref is obsolete and must be replaced before any future deployment |
| Vercel TEST project | `prj_g0JhQm6sgMOyOTXLWNHI8GYy3VYo` | Exists with no Git link, deployment or custom domain. Manual dashboard deletion link is available. |

The original independent top-level Supabase project was **not** created. The approved replacement was an isolated, data-less child branch. While active, it was populated with **35 application migrations** in its independent `visa_os_preview` schema, matching the current Production app migration count, and had no genuine users, agencies or applications. A restricted TEST-only SQL login was created, then destroyed with the branch. Credentials are not recorded here.

**Stop:** An attempt to publish the dedicated TEST code branch to the private GitHub repository was rejected by the environment authorization gate as an unapproved external code disclosure. No alternate upload/API path was attempted. Explicit owner approval to push the exact TEST branch is now needed. The Supabase branch also reported `MIGRATIONS_FAILED` in its managed branching status despite its manually verified 35-migration application schema; investigate branching workflow before re-creating or qualifying a new branch. No 10/25/50-VU load has been run and no capacity claim is justified.

## No-cost code work completed

- Dedicated local worktree based on the verified Production code tree; no GitHub push.
- Explicit branch build-time protections against automatic database migrations, seeding and Git auto-deployment.
- Hosted target allowlist validation: origin, branch, Vercel environment, project IDs, test schema and Supabase references; Production and legacy refs rejected.
- Focused safety, hosted-target and build-gate unit tests passing; typecheck and lint passing.
- The local-only k6 runner remains unchanged and forbids hosted targets.
- No hosted load has been sent, and no Production requests or writes have been generated.

## Cleanup gate

The hourly-charged Supabase branch was **deleted successfully** and the branch inventory confirmed it is absent. The empty Vercel TEST project can be retained for the next attempt without deployments; if cleanup is desired, project deletion requires owner action via its authenticated dashboard deletion link. No build deployment has been made yet.

## Further automatic stop conditions

Stop on any unexpected cost, wrong project ID, absence of TEST session/MFA evidence, absent monitoring, 1% or more unexpected errors, p95 at or above 2 seconds, integrity discrepancy, or TEST resource cleanup failure. Missing evidence is `INCONCLUSIVE`, never `PASS`.
