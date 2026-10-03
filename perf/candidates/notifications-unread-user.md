# Performance candidate — unread notifications index

Status: **NO_STRONG_LOCAL_BENEFIT; do not promote from local evidence; not applied to Preview or Production.**

Candidate under study:

```sql
create index if not exists notifications_unread_user_idx
  on notifications (user_id)
  where read_at is null;
```

## Exact query shape

```sql
select count(*)
from notifications
where user_id = $1
  and read_at is null;
```

## Evidence

At ~200k unread rows for the selected synthetic user:

**Full benchmark run**
- before p95: ~68.88 ms
- after p95: ~19.42 ms
- apparent reduction: ~71.8%

**Exact-shape warmed A/B experiment — first controlled run**
- before p95: ~24.57 ms
- after p95: ~19.18 ms
- speedup: ~1.28x
- automated verdict: `NO_STRONG_LOCAL_BENEFIT`

**Exact-shape symmetric warm-up rerun (5 warmups per phase, 30 measured repeats)**
- before p95: **~29.56 ms**
- after p95: **~30.84 ms**
- speedup: **~0.96x**
- automated verdict: **`NO_STRONG_LOCAL_BENEFIT`**

The symmetric rerun removes the earlier cache bias and shows no repeatable benefit. The original ~71.8% apparent gain must therefore be treated as noisy/non-authoritative evidence, not as a migration justification.

## Decision

**Do not create a migration from this candidate now.**

Hosted polling-only evidence may reopen the question only if unread-count pressure is a measured Preview bottleneck and a hosted A/B demonstrates a repeatable benefit.

No Production change is authorized by this file.
