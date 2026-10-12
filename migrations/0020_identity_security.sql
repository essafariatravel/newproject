-- Add independent agency handles while preserving user UUIDs and password hashes.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_pending boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS credential_version integer NOT NULL DEFAULT 0;
UPDATE users SET username='agency_' || replace(id::text,'-','') WHERE agency_id IS NOT NULL AND username IS NULL;
DROP INDEX IF EXISTS users_email_unique;
CREATE UNIQUE INDEX users_staff_email_unique ON users (lower(btrim(email))) WHERE agency_id IS NULL;
CREATE UNIQUE INDEX users_agency_username_unique ON users (username) WHERE agency_id IS NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_username_check CHECK (
  (agency_id IS NULL AND username IS NULL) OR
  (agency_id IS NOT NULL AND username IS NOT NULL AND username ~ '^[a-z0-9][a-z0-9._-]{2,47}$' AND username=lower(btrim(username)))
);
-- Legacy scripts/fixtures may omit the new handle. They receive a collision-free
-- UUID handle; normal account UI always supplies the chosen normalized username.
CREATE FUNCTION assign_legacy_agency_username() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.agency_id IS NOT NULL AND NEW.username IS NULL THEN
    NEW.username := 'agency_' || replace(NEW.id::text,'-','');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER users_legacy_username BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION assign_legacy_agency_username();

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS credential_version integer NOT NULL DEFAULT 0;
-- Old fixed seven-day cookies must not outlive the new absolute policy.
UPDATE sessions SET expires_at=least(expires_at, created_at + CASE WHEN EXISTS
  (SELECT 1 FROM users u WHERE u.id=sessions.user_id AND u.agency_id IS NOT NULL)
  THEN interval '24 hours' ELSE interval '12 hours' END), last_activity_at=created_at;

CREATE TABLE account_recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), identifier text NOT NULL,
  user_id uuid REFERENCES users(id), status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','LINK_ISSUED','CLOSED')),
  resolved_by uuid REFERENCES users(id), resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_recovery_requests_queue_idx ON account_recovery_requests(status,created_at);
CREATE TABLE account_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, purpose text NOT NULL CHECK(purpose IN ('ACTIVATION','PASSWORD_RESET')),
  credential_version integer NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_access_tokens_user_idx ON account_access_tokens(user_id);
CREATE TABLE auth_rate_limits (
  key text PRIMARY KEY, attempts integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE account_recovery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_recovery_requests, account_access_tokens, auth_rate_limits FROM PUBLIC;
