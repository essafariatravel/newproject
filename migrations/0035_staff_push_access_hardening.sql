-- Defense-in-depth for confidential Web Push endpoints and encryption keys.
-- The application accesses this private schema with its server-side database role.
alter table push_subscriptions enable row level security;
revoke all privileges on table push_subscriptions from public, anon, authenticated;
comment on table push_subscriptions is
  'Private staff Web Push endpoints and cryptographic subscription keys; never grant Data API access.';
