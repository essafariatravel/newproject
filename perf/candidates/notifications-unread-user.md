# Proven performance candidate — unread notifications index

Status: **local disposable proof complete; not promoted to migrations; not applied to Preview or Production.**

Candidate:

```sql
create index if not exists notifications_unread_user_idx
  on notifications (user_id)
  where read_at is null;
```

## Evidence

The exact application poll shape is:

```sql
select count(*)
from notifications
where user_id = $1
  and read_at is null;
```

On the disposable 100k-application proof dataset, the notifications table contained roughly 300k synthetic rows and the selected PERF user had **200,008 unread rows**.

Measured p95:

- before index: **68.88 ms**
- after index: **19.42 ms**
- p95 reduction: **71.8%**
- local index build: **~68.6 ms**

The index was temporary proof infrastructure only.

## Promotion rule

Do not add this file directly to the migration ledger.

When the hardening branch stops moving:

1. allocate the next migration number;
2. use the transaction-compatible SQL above because the current migration runner wraps all migrations in one transaction;
3. run the migration on Preview and measure lock/build duration;
4. rerun polling-only and the hosted tier that exposed notification pressure;
5. compare against the pre-index baseline;
6. retain the index only if hosted evidence confirms the benefit without unacceptable write/migration impact.

No Production change is authorized by this evidence file.
