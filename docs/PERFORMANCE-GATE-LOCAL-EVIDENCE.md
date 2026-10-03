# ESSAFARIA VISA OS — Local Scale Evidence

Status: **measured disposable PostgreSQL evidence only**  
Hosted Preview capacity claim: **NONE**  
Production actions: **NONE**

This file condenses the completed local scale work so the final execution agent does not need to reconstruct conclusions from GitHub Actions logs.

## Evidence runs

- 1k → 10k disposable scale proof: workflow run `37159584394` — PASS
- 10k → 100k exact-shape scale proof: workflow run `37159825006` — PASS
- unread-notification before/after proof: workflow run `37159959857` — PASS
- exact-shape symmetric A/B index proof: workflow run `37160093409` — PASS

All runs used disposable localhost PostgreSQL. They are diagnostic/growth evidence, not Vercel or hosted Supabase capacity evidence.

## Dataset shape

The scale proofs modelled up to:

- 100,000 applications;
- 1,000 agencies;
- 4 document metadata rows per application;
- 3 notifications per application;
- 1 communication per application;
- 3 audit rows per application;
- synthetic wallet ledger volume.

Storage byte throughput remains covered by the separate 2 MB concurrency suite.

## 10k vs 100k query p95

| Query | 10k p95 | 100k p95 | Interpretation |
| --- | ---: | ---: | --- |
| Agency applications first page | 0.81 ms | 1.14 ms | Stable |
| Broad application search | 0.85 ms | 0.95 ms | Stable |
| Applications OFFSET 500 | 3.94 ms | 38.18 ms | Roughly linear growth |
| Applications OFFSET 5k | 3.46 ms | 40.54 ms | Roughly linear growth |
| Applications OFFSET ~90k | — | 48.93 ms | Deep OFFSET cost visible |
| Filtered application count | 1.96 ms | 26.69 ms | Roughly linear |
| 5,001-row export query | 20.37 ms | 66.56 ms | Sublinear/acceptable local DB cost |
| Report by country | 4.47 ms | 42.31 ms | Roughly linear |
| Report by status | 2.83 ms | 46.04 ms | Roughly linear |
| Processing-time aggregate | 1.19 ms | 20.33 ms | Roughly linear |
| Wallet flow aggregate | 2.11 ms | 17.66 ms | Roughly linear |
| Audit first page | 7.95 ms | 1.41 ms | No scale concern shown |
| Audit deep page | 14.61 ms | 88.77 ms | Deep OFFSET / sort pressure |
| Notifications latest | 0.80 ms | 0.89 ms | Stable |
| Notifications unread count | 5.97 ms | 76.83 ms | Polling-sensitive growth |
| Recent communications benchmark | 4.90 ms | 47.18 ms | Growth visible |
| Document issue count | 20.38 ms | 0.79 ms | Noisy/planner-sensitive; do not optimize from this sample |

## EXPLAIN observations at 100k

Notable measured observations:

- deep application pagination reached ~60 ms EXPLAIN execution and showed multiple planner findings;
- audit deep page reached ~65 ms EXPLAIN execution and showed temporary/disk I/O;
- unread notification count reached ~67 ms EXPLAIN execution with cardinality-estimate findings;
- report-by-country reached ~34 ms EXPLAIN execution with a large sequential scan;
- wallet aggregate remained ~19 ms EXPLAIN execution.

These values are still well below the user-facing HTTP budgets because they are direct local DB measurements. They identify where hosted correlation should focus; they do not justify broad schema changes by themselves.

## Index decisions

### 1. Recent communications — PROVEN_LOCAL_CANDIDATE

Exact production staff inbox shape:

```sql
select ...
from communications
join users ...
join applications ...
order by communications.created_at desc
limit 30;
```

Candidate:

```sql
create index if not exists communications_created_idx
  on communications (created_at desc);
```

Evidence on 100k applications / ~100k communications:

**First exact-shape A/B**
- before p95: ~18.49 ms
- after p95: ~0.38 ms
- speedup: ~48.63x

**Symmetric warm-up rerun**
- 5 warmups per phase;
- 30 measured repeats;
- before p95: ~20.49 ms;
- after p95: ~0.53 ms;
- speedup: ~38.44x.

Decision:

**Keep as a proven local candidate, but do not promote to a migration until hosted Preview confirms benefit and the hardening migration sequence freezes.**

Candidate files:

- `perf/candidates/communications-created.md`
- `perf/candidates/communications-created.sql`

### 2. Unread notification partial index — DEFER

Candidate studied:

```sql
create index if not exists notifications_unread_user_idx
  on notifications (user_id)
  where read_at is null;
```

Evidence was inconsistent.

Broad before/after benchmark:
- ~68.88 ms → ~19.42 ms;
- apparent ~71.8% improvement.

First warmed exact-shape A/B:
- ~24.57 ms → ~19.18 ms;
- ~1.28x;
- no strong benefit.

Symmetric warm-up rerun:
- ~29.56 ms → ~30.84 ms;
- ~0.96x;
- no benefit.

Decision:

**DEFER. Do not create a migration. Hosted polling-only evidence must prove a repeatable bottleneck and benefit first.**

The executable SQL candidate was removed to prevent accidental promotion. The rationale remains in:

- `perf/candidates/notifications-unread-user.md`

## Pagination decision

At 100k rows, deep application OFFSET reads reached approximately 37–49 ms p95 locally.

That is visible growth, but not enough to justify a keyset/cursor refactor before hosted evidence.

Decision:

- preserve current pagination for now;
- if hosted list/search p95 breaches the 700 ms budget and DB evidence points at OFFSET/sort work, prefer a keyset/cursor experiment rather than adding arbitrary indexes;
- measure page 1 and the actual user-reachable deep pages separately.

## Reporting decision

Country/status reports grew roughly linearly to ~42–46 ms direct-DB p95 at 100k.

Decision:

- no pre-aggregation/materialized-view redesign now;
- retain the report budget of p95 2 s / p99 4 s at HTTP level;
- only redesign reporting if hosted Vercel + PostgreSQL evidence shows the aggregate queries are a meaningful share of end-to-end latency or resource pressure.

## Polling decision

Polling remains a potential amplification source because the application performs:

- notifications every 15 s;
- presence every 45 s;
- session validity every 60 s.

The local unread-count query showed scale growth but no repeatable index win.

Decision:

1. run the hosted `polling-only` profile;
2. correlate actual RPS, DB active connections, wait events and pg_stat_statements;
3. change intervals/query shape/indexing only if hosted evidence proves pressure.

## What the final agent should NOT redo

Do not repeat:

- 1k / 10k / 100k disposable seeding just to discover basic growth;
- generic EXPLAIN inventory;
- blind index brainstorming;
- the notification partial-index experiment;
- the communications-created index A/B experiment;
- local wallet race correctness;
- local 2 MB storage concurrency proof.

Redo only when needed for a changed query/schema or to validate a specific fix.

## Remaining evidence gap

The decisive remaining gap is hosted Preview execution:

- real Next.js/Vercel request latency;
- actual Preview Supabase connection/wait behavior;
- polling amplification under concurrent sessions;
- Vercel runtime/memory behavior for exports;
- actual storage provider correctness;
- wallet/storage correctness in the approved hosted Preview context;
- recovery after a hosted spike.

Use `.github/workflows/perf-hosted-preview.yml` or the guarded `npm run perf:run-tier` runner. Never load-test Production.
