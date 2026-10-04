-- Additive repair for early local candidate checkpoints of reconciliation.
-- Fresh 0026 schemas already have this sequence. Never rewrite event history.
alter table legacy_reconciliation_events
  add column if not exists event_sequence bigserial not null;
create unique index if not exists legacy_reconciliation_event_sequence_idx
  on legacy_reconciliation_events(event_sequence);
