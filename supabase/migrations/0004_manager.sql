BEGIN;

-- Migration 0003: Single Manager Session Queue & Approval Integration
-- Preserves all historical tables (business_config, customers, messages, slots, bookings, leads, tasks, shared_notes, agent_events).

CREATE TABLE IF NOT EXISTS manager_sessions (
  id uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  session_file text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed default session
INSERT INTO manager_sessions (id)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS manager_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES manager_sessions(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('chat', 'twilio', 'approval', 'worker')),
  dedupe_key text UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'interrupted')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS manager_events_session_status_idx ON manager_events (session_id, status, created_at);

CREATE TABLE IF NOT EXISTS manager_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES manager_sessions(id) ON DELETE CASCADE,
  event_id uuid REFERENCES manager_events(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS manager_messages_session_idx ON manager_messages (session_id, created_at);

CREATE TABLE IF NOT EXISTS manager_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES manager_sessions(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'working' CHECK (status IN ('working', 'waiting', 'needs_approval', 'done')),
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS manager_tasks_session_idx ON manager_tasks (session_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS manager_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES manager_sessions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('send_sms', 'book')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executing', 'executed', 'failed', 'interrupted')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS manager_approvals_session_idx ON manager_approvals (session_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS manager_messages_event_role_idx
  ON manager_messages (event_id, role) WHERE event_id IS NOT NULL;

-- RPC for atomic booking (UPDATE slots booked<capacity THEN INSERT bookings)
CREATE OR REPLACE FUNCTION manager_book(
  p_phone text,
  p_service text,
  p_pet_name text,
  p_details jsonb,
  p_slot uuid,
  p_total_cents int
) RETURNS bookings
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_slot slots%ROWTYPE;
  v_booking bookings%ROWTYPE;
BEGIN
  -- Ensure customer row exists before booking
  IF p_phone IS NOT NULL AND p_phone <> '' THEN
    INSERT INTO customers (phone, name)
    VALUES (p_phone, NULLIF(trim(p_details->>'customer_name'), ''))
    ON CONFLICT (phone) DO UPDATE
    SET name = COALESCE(EXCLUDED.name, customers.name);
  END IF;

  -- Lock slot row and verify capacity
  SELECT * INTO v_slot FROM slots WHERE id = p_slot FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'slot_not_found' USING HINT = 'Specified slot_id does not exist';
  END IF;

  IF v_slot.booked >= v_slot.capacity THEN
    RAISE EXCEPTION 'slot_taken' USING HINT = 'Slot capacity reached';
  END IF;
  IF v_slot.starts_at <= now() OR
     v_slot.starts_at IS DISTINCT FROM (p_details->>'starts_at')::timestamptz THEN
    RAISE EXCEPTION 'slot_time_changed_or_expired';
  END IF;

  UPDATE slots SET booked = booked + 1 WHERE id = p_slot;

  INSERT INTO bookings (phone, service, pet_name, details, slot_id, total_cents, status)
  VALUES (p_phone, p_service, p_pet_name, COALESCE(p_details, '{}'::jsonb), p_slot, p_total_cents, 'confirmed')
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

-- RPC for atomic approval decision and event enqueue
CREATE OR REPLACE FUNCTION manager_decide_approval(
  p_approval_id uuid,
  p_decision text
) RETURNS manager_approvals
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_approval manager_approvals%ROWTYPE;
  v_new_status text;
  v_dedupe_key text;
BEGIN
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'invalid_decision' USING HINT = 'Decision must be approve or reject';
  END IF;

  v_new_status := CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END;

  UPDATE manager_approvals
  SET status = v_new_status
  WHERE id = p_approval_id AND status = 'pending'
  RETURNING * INTO v_approval;

  IF NOT FOUND THEN
    SELECT * INTO v_approval FROM manager_approvals WHERE id = p_approval_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'approval_not_found' USING HINT = 'Specified approval_id does not exist';
    END IF;
    RETURN v_approval;
  END IF;

  v_dedupe_key := 'approval:' || p_approval_id::text || ':' || p_decision;

  PERFORM manager_enqueue_event(
    v_approval.session_id,
    'approval',
    jsonb_build_object('approval_id', p_approval_id, 'decision', p_decision),
    v_dedupe_key,
    NULL
  );

  RETURN v_approval;
END;
$$;

-- Atomic Queue Helper Functions
CREATE OR REPLACE FUNCTION manager_enqueue_event(
  p_session_id uuid,
  p_source text,
  p_payload jsonb,
  p_dedupe_key text DEFAULT NULL,
  p_user_message text DEFAULT NULL
) RETURNS manager_events
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_event manager_events%ROWTYPE;
BEGIN
  IF p_dedupe_key IS NOT NULL THEN
    INSERT INTO manager_events (session_id, source, payload, dedupe_key, status)
    VALUES (p_session_id, p_source, COALESCE(p_payload, '{}'::jsonb), p_dedupe_key, 'queued')
    ON CONFLICT (dedupe_key) DO UPDATE SET dedupe_key = EXCLUDED.dedupe_key
    RETURNING * INTO v_event;
  ELSE
    INSERT INTO manager_events (session_id, source, payload, status)
    VALUES (p_session_id, p_source, COALESCE(p_payload, '{}'::jsonb), 'queued')
    RETURNING * INTO v_event;
  END IF;
  IF v_event.session_id <> p_session_id OR v_event.source <> p_source
     OR v_event.payload <> COALESCE(p_payload, '{}'::jsonb) THEN
    RAISE EXCEPTION 'dedupe_key_conflict';
  END IF;

  IF p_user_message IS NOT NULL AND p_user_message <> '' THEN
    INSERT INTO manager_messages (session_id, event_id, role, content)
    VALUES (p_session_id, v_event.id, 'user', p_user_message)
    ON CONFLICT (event_id, role) WHERE event_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN v_event;
END;
$$;

CREATE OR REPLACE FUNCTION manager_claim_event(p_session_id uuid)
RETURNS manager_events
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_event manager_events%ROWTYPE;
  v_running int;
BEGIN
  -- Lock manager_sessions row to serialize event claim per session
  PERFORM 1 FROM manager_sessions WHERE id = p_session_id FOR UPDATE;

  SELECT count(*) INTO v_running
  FROM manager_events
  WHERE session_id = p_session_id AND status = 'running';

  IF v_running > 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_event
  FROM manager_events
  WHERE session_id = p_session_id AND status = 'queued'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    UPDATE manager_events
    SET status = 'running', started_at = now()
    WHERE id = v_event.id
    RETURNING * INTO v_event;
    RETURN v_event;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION manager_recover_running(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_events_count int;
  v_approvals_count int;
BEGIN
  WITH updated_events AS (
    UPDATE manager_events
    SET status = 'interrupted',
        completed_at = now(),
        error = COALESCE(error, 'interrupted by server restart')
    WHERE session_id = p_session_id AND status = 'running'
    RETURNING id
  )
  SELECT count(*) INTO v_events_count FROM updated_events;

  WITH updated_approvals AS (
    UPDATE manager_approvals
    SET status = 'interrupted',
        result = COALESCE(result, jsonb_build_object('error', 'interrupted by server restart'))
    WHERE session_id = p_session_id AND status = 'executing'
    RETURNING id
  )
  SELECT count(*) INTO v_approvals_count FROM updated_approvals;

  RETURN jsonb_build_object('events_count', v_events_count, 'approvals_count', v_approvals_count);
END;
$$;

-- Service role access configuration and security privilege isolation
DO $$
DECLARE
  t text;
  fn text;
BEGIN
  FOREACH t IN ARRAY ARRAY['manager_sessions', 'manager_events', 'manager_messages', 'manager_tasks', 'manager_approvals']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS service_role_all ON %I', t);
    EXECUTE format('CREATE POLICY service_role_all ON %I TO service_role USING (true) WITH CHECK (true)', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;

  FOREACH fn IN ARRAY ARRAY[
    'manager_book(text,text,text,jsonb,uuid,integer)',
    'manager_decide_approval(uuid,text)',
    'manager_enqueue_event(uuid,text,jsonb,text,text)',
    'manager_claim_event(uuid)',
    'manager_recover_running(uuid)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

COMMIT;
