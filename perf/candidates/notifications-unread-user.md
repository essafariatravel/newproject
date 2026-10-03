# Performance candidate — unread notifications index

Status: **mixed local evidence; DEFER promotion; not applied to Preview or Production.**

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

**Exact-shape warmed A/B experiment**
- before p95: ~24.57 ms
- after p95: ~19.18 ms
- speedup: ~1.28x
- automated verdict: `NO_STRONG_LOCAL_BENEFIT`

The second experiment controls warm-up and removes more noise, so the evidence is not strong enough to promote this index yet.

## Decision

**Do not create a migration from this candidate now.**

Hosted polling-only evidence should determine whether unread-count pressure is material on Preview. Promote only if the hosted plan/latency shows a meaningful bottleneck and the same index produces a repeatable benefit.

No Production change is authorized by this file.
