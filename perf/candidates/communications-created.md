# Proven local performance candidate — recent communications index

Status: **PROVEN_LOCAL_CANDIDATE; not promoted to migrations; not applied to Preview or Production.**

Candidate:

```sql
create index if not exists communications_created_idx
  on communications (created_at desc);
```

## Why this matches the application

The staff `recentCommunications()` read model joins communications → users → applications and orders the inbox by:

```sql
order by communications.created_at desc
limit 30
```

The disposable experiment exercised that same staff ordering shape.

## A/B evidence

100k synthetic applications with one communication per application:

- before p95: **~18.49 ms**
- after p95: **~0.38 ms**
- p95 speedup: **~48.63x**
- automated verdict: **PROVEN_LOCAL_CANDIDATE**

The temporary proof index was dropped after the experiment.

## Promotion rule

Do not place this directly in the migration ledger while the hardening branch is still allocating migration numbers.

After hardening freezes:

1. allocate the next migration number;
2. add the transaction-compatible `CREATE INDEX IF NOT EXISTS` statement;
3. apply on Preview and record migration lock/build duration;
4. rerun the hosted communications workload / relevant mixed tier;
5. compare baseline vs candidate;
6. retain only if hosted evidence confirms the local benefit.

The current migration runner executes all SQL files inside one transaction, therefore `CREATE INDEX CONCURRENTLY` cannot be used without a separate migration mechanism.

No Production change is authorized by this evidence file.
