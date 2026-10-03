-- PERFORMANCE CANDIDATE — NOT EXECUTED BY THE MIGRATION RUNNER
-- Exact staff recent-communications query shape was tested on a disposable
-- 100k-application dataset. Local p95 improved from ~18.49 ms to ~0.38 ms
-- (~48.6x speedup). Promote only after hosted Preview confirmation and after
-- the hardening migration sequence freezes.

create index if not exists communications_created_idx
  on communications (created_at desc);
