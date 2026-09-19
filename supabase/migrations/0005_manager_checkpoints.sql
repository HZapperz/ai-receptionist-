BEGIN;

-- OMP transcripts are private service-role state, not dashboard message history.
CREATE TABLE manager_session_checkpoints (
  session_id uuid PRIMARY KEY REFERENCES manager_sessions(id) ON DELETE CASCADE,
  file_name text NOT NULL CHECK (file_name ~ '^[a-zA-Z0-9_.-]+[.]jsonl$'),
  content text NOT NULL CHECK (length(content) > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE manager_session_checkpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all ON manager_session_checkpoints
  TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON manager_session_checkpoints FROM PUBLIC, anon, authenticated;
GRANT ALL ON manager_session_checkpoints TO service_role;

COMMIT;
