-- PERFORMANCE CANDIDATE — NOT EXECUTED BY THE MIGRATION RUNNER
-- Evidence: disposable 100k-application / ~300k-notification workload.
-- Exact unread poll query p95 improved from ~68.88 ms to ~19.42 ms (-71.8%).
-- Promote to the next migration number only after the hardening migration sequence freezes.
-- Repository migrations run inside one transaction, so CREATE INDEX CONCURRENTLY is not valid there.
-- Preview must verify migration lock duration before Production promotion.

create index if not exists notifications_unread_user_idx
  on notifications (user_id)
  where read_at is null;
