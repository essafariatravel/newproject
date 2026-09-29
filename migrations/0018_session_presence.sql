-- Lightweight authenticated presence. No identities are exposed by the API.
-- Additive; expires when the owning session is deleted.
CREATE TABLE IF NOT EXISTS session_presence (
  session_id uuid PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS session_presence_recent_idx ON session_presence(last_seen_at);
-- Only the trusted application server may access session activity.
ALTER TABLE session_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON session_presence FROM PUBLIC;
