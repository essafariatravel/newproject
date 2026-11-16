-- Only staff / administrator Web Push devices. Existing in-app notifications remain unchanged.
-- Applying this migration is a separate, approved deployment step.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint_hash text not null unique,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on push_subscriptions(user_id, updated_at desc);
comment on table push_subscriptions is 'Staff-only, opt-in Web Push devices. Secret endpoint and encryption keys never exposed to public APIs.';
