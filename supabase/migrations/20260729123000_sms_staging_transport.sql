-- Secure persistence boundary for the opt-in SMS planning pilot.
--
-- The tables deliberately contain no plaintext phone number and no plaintext
-- inbound or outbound message. Client roles receive no table or function
-- access. The Worker looks contacts up by a separately keyed HMAC, encrypts
-- the phone/reply with AES-GCM, and stores only a keyed digest of inbound text.

CREATE TABLE IF NOT EXISTS public.sms_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash text NOT NULL UNIQUE
    CHECK (phone_hash ~ '^[0-9a-f]{64}$'),
  phone_ciphertext text NOT NULL
    CHECK (char_length(phone_ciphertext) BETWEEN 24 AND 512),
  consent_state text NOT NULL DEFAULT 'active'
    CHECK (consent_state IN ('active', 'stopped')),
  consent_at timestamptz NOT NULL DEFAULT now(),
  opt_out_at timestamptz,
  retention_until timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL UNIQUE
    REFERENCES public.sms_contacts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'stopped')),
  draft jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(draft) = 'object' AND pg_column_size(draft) <= 16384),
  turn_count integer NOT NULL DEFAULT 0
    CHECK (turn_count BETWEEN 0 AND 10000),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  rate_window_start timestamptz NOT NULL DEFAULT now(),
  rate_count integer NOT NULL DEFAULT 0 CHECK (rate_count >= 0),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL
    REFERENCES public.sms_conversations(id) ON DELETE CASCADE,
  provider_message_sid text NOT NULL UNIQUE
    CHECK (provider_message_sid ~ '^SM[0-9A-Fa-f]{32}$'),
  direction text NOT NULL DEFAULT 'inbound'
    CHECK (direction = 'inbound'),
  body_digest text NOT NULL
    CHECK (body_digest ~ '^[0-9a-f]{64}$'),
  reply_ciphertext text
    CHECK (reply_ciphertext IS NULL OR char_length(reply_ciphertext) BETWEEN 24 AND 4096),
  planning_kind text NOT NULL
    CHECK (
      planning_kind IN (
        'planning', 'help', 'stopped', 'resumed', 'reset', 'ignored', 'rate_limited'
      )
    ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_service_budget (
  scope text PRIMARY KEY CHECK (scope = 'inbound'),
  rate_window_start timestamptz NOT NULL DEFAULT now(),
  rate_count integer NOT NULL DEFAULT 0 CHECK (rate_count >= 0)
);

CREATE TABLE IF NOT EXISTS public.sms_replay_tombstones (
  provider_message_sid text PRIMARY KEY
    CHECK (provider_message_sid ~ '^SM[0-9A-Fa-f]{32}$'),
  phone_hash text NOT NULL CHECK (phone_hash ~ '^[0-9a-f]{64}$'),
  body_digest text NOT NULL CHECK (body_digest ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '180 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.sms_contacts(id) ON DELETE CASCADE,
  provider_message_sid text NOT NULL UNIQUE
    CHECK (provider_message_sid ~ '^SM[0-9A-Fa-f]{32}$'),
  event_kind text NOT NULL CHECK (event_kind IN ('opted_out', 'resumed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_messages_conversation_created_idx
  ON public.sms_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sms_contacts_retention_idx
  ON public.sms_contacts(retention_until);
CREATE INDEX IF NOT EXISTS sms_replay_tombstones_expiry_idx
  ON public.sms_replay_tombstones(expires_at);

ALTER TABLE public.sms_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_service_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_replay_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_consent_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sms_contacts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.sms_conversations FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.sms_messages FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.sms_service_budget FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.sms_replay_tombstones FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.sms_consent_events FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_sms_inbound_context(
  _phone_hash text,
  _provider_message_sid text,
  _body_digest text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  existing_phone_hash text;
  existing_body_digest text;
  conversation_row public.sms_conversations%ROWTYPE;
BEGIN
  IF _phone_hash !~ '^[0-9a-f]{64}$'
     OR _provider_message_sid !~ '^SM[0-9A-Fa-f]{32}$'
     OR _body_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  SELECT t.phone_hash, t.body_digest
    INTO existing_phone_hash, existing_body_digest
    FROM public.sms_replay_tombstones AS t
   WHERE t.provider_message_sid = _provider_message_sid
   LIMIT 1;

  IF FOUND THEN
    IF existing_phone_hash <> _phone_hash OR existing_body_digest <> _body_digest THEN
      RAISE EXCEPTION 'provider id conflict';
    END IF;
    -- A retry must not repeat TwiML that could create a second outbound SMS.
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  SELECT c.*
    INTO conversation_row
    FROM public.sms_conversations AS c
    JOIN public.sms_contacts AS contact ON contact.id = c.contact_id
   WHERE contact.phone_hash = _phone_hash
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'new',
      'version', 0,
      'state', jsonb_build_object(
        'status', 'active',
        'draft', '{}'::jsonb,
        'turnCount', 0
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'new',
    'version', conversation_row.version,
    'state', jsonb_build_object(
      'status', conversation_row.status,
      'draft', conversation_row.draft,
      'turnCount', conversation_row.turn_count
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_sms_inbound(
  _phone_hash text,
  _phone_ciphertext text,
  _provider_message_sid text,
  _body_digest text,
  _next_state jsonb,
  _reply_ciphertext text,
  _rate_limited_reply_ciphertext text,
  _planning_kind text,
  _expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  contact_row public.sms_contacts%ROWTYPE;
  conversation_row public.sms_conversations%ROWTYPE;
  existing_phone_hash text;
  existing_body_digest text;
  state_status text;
  state_draft jsonb;
  state_turn_count integer;
  limited boolean := false;
  stored_reply text;
  stored_kind text;
  service_window_start timestamptz;
  service_rate_count integer;
  service_limited boolean := false;
BEGIN
  IF _phone_hash !~ '^[0-9a-f]{64}$'
     OR char_length(_phone_ciphertext) NOT BETWEEN 24 AND 512
     OR _provider_message_sid !~ '^SM[0-9A-Fa-f]{32}$'
     OR _body_digest !~ '^[0-9a-f]{64}$'
     OR (
       _reply_ciphertext IS NOT NULL
       AND char_length(_reply_ciphertext) NOT BETWEEN 24 AND 4096
     )
     OR char_length(_rate_limited_reply_ciphertext) NOT BETWEEN 24 AND 4096
     OR _planning_kind NOT IN ('planning','help','stopped','resumed','reset','ignored')
     OR _expected_version < 0
     OR jsonb_typeof(_next_state) <> 'object'
     OR (
       SELECT array_agg(key ORDER BY key)
         FROM jsonb_object_keys(_next_state) AS key
     ) IS DISTINCT FROM ARRAY['draft','status','turnCount']::text[] THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  state_status := _next_state->>'status';
  state_draft := _next_state->'draft';
  BEGIN
    state_turn_count := (_next_state->>'turnCount')::integer;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'invalid payload';
  END;

  IF state_status NOT IN ('active', 'stopped')
     OR jsonb_typeof(state_draft) <> 'object'
     OR pg_column_size(state_draft) > 16384
     OR state_turn_count NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;
  IF (_planning_kind = 'stopped' AND state_status <> 'stopped')
     OR (_planning_kind = 'resumed' AND state_status <> 'active')
     OR (_planning_kind = 'ignored' AND state_status <> 'stopped') THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  -- Serializes retries and concurrent messages from one sender across every
  -- Worker isolate. The provider SID unique index remains a second boundary.
  PERFORM pg_advisory_xact_lock(hashtextextended(_phone_hash, 0));

  SELECT t.phone_hash, t.body_digest
    INTO existing_phone_hash, existing_body_digest
    FROM public.sms_replay_tombstones AS t
   WHERE t.provider_message_sid = _provider_message_sid
   LIMIT 1;
  IF FOUND THEN
    IF existing_phone_hash <> _phone_hash OR existing_body_digest <> _body_digest THEN
      RAISE EXCEPTION 'provider id conflict';
    END IF;
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  SELECT *
    INTO contact_row
    FROM public.sms_contacts
   WHERE phone_hash = _phone_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.sms_contacts(phone_hash, phone_ciphertext)
    VALUES (_phone_hash, _phone_ciphertext)
    RETURNING * INTO contact_row;
  ELSE
    UPDATE public.sms_contacts
       SET phone_ciphertext = _phone_ciphertext,
           retention_until = now() + interval '30 days',
           updated_at = now()
     WHERE id = contact_row.id
    RETURNING * INTO contact_row;
  END IF;

  SELECT *
    INTO conversation_row
    FROM public.sms_conversations
   WHERE contact_id = contact_row.id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.sms_conversations(contact_id)
    VALUES (contact_row.id)
    RETURNING * INTO conversation_row;
  END IF;

  IF conversation_row.version <> _expected_version THEN
    RETURN jsonb_build_object(
      'status', 'conflict',
      'version', conversation_row.version,
      'state', jsonb_build_object(
        'status', conversation_row.status,
        'draft', conversation_row.draft,
        'turnCount', conversation_row.turn_count
      )
    );
  END IF;

  IF conversation_row.rate_window_start <= now() - interval '1 hour' THEN
    conversation_row.rate_window_start := now();
    conversation_row.rate_count := 0;
  END IF;

  INSERT INTO public.sms_service_budget(scope)
  VALUES ('inbound')
  ON CONFLICT (scope) DO NOTHING;
  SELECT rate_window_start, rate_count
    INTO service_window_start, service_rate_count
    FROM public.sms_service_budget
   WHERE scope = 'inbound'
   FOR UPDATE;
  IF service_window_start <= now() - interval '1 hour' THEN
    service_window_start := now();
    service_rate_count := 0;
  END IF;

  -- STOP/START/HELP must remain available even after a noisy thread reaches
  -- the planning limit.
  service_limited := service_rate_count >= 200
    AND _planning_kind NOT IN ('stopped', 'resumed', 'help');
  limited := (conversation_row.rate_count >= 40 OR service_limited)
    AND _planning_kind NOT IN ('stopped', 'resumed', 'help');
  stored_reply := CASE
    WHEN limited AND NOT service_limited AND conversation_row.rate_count = 40
      THEN _rate_limited_reply_ciphertext
    WHEN limited
      THEN NULL
    ELSE _reply_ciphertext
  END;
  stored_kind := CASE WHEN limited THEN 'rate_limited' ELSE _planning_kind END;

  UPDATE public.sms_service_budget
     SET rate_window_start = service_window_start,
         rate_count = service_rate_count + 1
   WHERE scope = 'inbound';

  IF limited THEN
    UPDATE public.sms_conversations
       SET rate_window_start = conversation_row.rate_window_start,
           rate_count = conversation_row.rate_count + 1,
           version = version + 1,
           last_activity_at = now(),
           updated_at = now()
     WHERE id = conversation_row.id
    RETURNING * INTO conversation_row;
  ELSE
    UPDATE public.sms_conversations
       SET status = state_status,
           draft = state_draft,
           turn_count = state_turn_count,
           version = version + 1,
           rate_window_start = conversation_row.rate_window_start,
           rate_count = conversation_row.rate_count + 1,
           last_activity_at = now(),
           updated_at = now()
     WHERE id = conversation_row.id
    RETURNING * INTO conversation_row;

    UPDATE public.sms_contacts
       SET consent_state = state_status,
           consent_at = CASE
             WHEN state_status = 'active' AND consent_state = 'stopped' THEN now()
             ELSE consent_at
           END,
           opt_out_at = CASE WHEN state_status = 'stopped' THEN now() ELSE NULL END,
           updated_at = now()
     WHERE id = contact_row.id;
  END IF;

  INSERT INTO public.sms_messages(
    conversation_id,
    provider_message_sid,
    body_digest,
    reply_ciphertext,
    planning_kind
  ) VALUES (
    conversation_row.id,
    _provider_message_sid,
    _body_digest,
    stored_reply,
    stored_kind
  );

  INSERT INTO public.sms_replay_tombstones(
    provider_message_sid,
    phone_hash,
    body_digest
  ) VALUES (
    _provider_message_sid,
    _phone_hash,
    _body_digest
  );

  IF stored_kind IN ('stopped', 'resumed') THEN
    INSERT INTO public.sms_consent_events(
      contact_id,
      provider_message_sid,
      event_kind
    ) VALUES (
      contact_row.id,
      _provider_message_sid,
      CASE WHEN stored_kind = 'stopped' THEN 'opted_out' ELSE 'resumed' END
    );
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN limited THEN 'rate_limited' ELSE 'committed' END,
    'replyCiphertext', stored_reply,
    'version', conversation_row.version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_sms_data(_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  deleted_contacts integer;
  deleted_tombstones integer;
BEGIN
  IF _limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  WITH expired AS (
    SELECT id
      FROM public.sms_contacts
     WHERE retention_until <= now()
     ORDER BY retention_until
     LIMIT _limit
     FOR UPDATE SKIP LOCKED
  ),
  removed AS (
    DELETE FROM public.sms_contacts
     WHERE id IN (SELECT id FROM expired)
    RETURNING 1
  )
  SELECT count(*) INTO deleted_contacts FROM removed;

  WITH expired AS (
    SELECT provider_message_sid
      FROM public.sms_replay_tombstones
     WHERE expires_at <= now()
     ORDER BY expires_at
     LIMIT _limit
     FOR UPDATE SKIP LOCKED
  ),
  removed AS (
    DELETE FROM public.sms_replay_tombstones
     WHERE provider_message_sid IN (SELECT provider_message_sid FROM expired)
    RETURNING 1
  )
  SELECT count(*) INTO deleted_tombstones FROM removed;

  RETURN jsonb_build_object(
    'deletedContacts', deleted_contacts,
    'deletedTombstones', deleted_tombstones
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_sms_inbound_context(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_sms_inbound(
  text, text, text, text, jsonb, text, text, text, bigint
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_expired_sms_data(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sms_inbound_context(text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_sms_inbound(
  text, text, text, text, jsonb, text, text, text, bigint
) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_sms_data(integer)
  TO service_role;
