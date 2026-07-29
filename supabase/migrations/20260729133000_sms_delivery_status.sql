-- Forward-only expansion for delivery receipts on TwiML-generated SMS replies.
--
-- The previous migration may already be recorded in a database, so this file
-- deliberately upgrades that schema instead of rewriting it. The original
-- nine-argument commit RPC remains available during the expand/deploy window
-- so the prior Worker is a valid rollback target. A later contract migration
-- may remove it only after the receipt-aware Worker is exact-release verified.

ALTER TABLE public.sms_messages
  ADD COLUMN IF NOT EXISTS delivery_receipt_token text UNIQUE
    CHECK (
      delivery_receipt_token IS NULL
      OR delivery_receipt_token ~ '^[0-9a-f]{64}$'
    ),
  ADD COLUMN IF NOT EXISTS outbound_message_sid text UNIQUE
    CHECK (
      outbound_message_sid IS NULL
      OR outbound_message_sid ~ '^SM[0-9A-Fa-f]{32}$'
    ),
  ADD COLUMN IF NOT EXISTS delivery_status text
    CHECK (
      delivery_status IS NULL
      OR delivery_status IN (
        'queued', 'sending', 'sent', 'delivered',
        'undelivered', 'failed', 'invalid'
      )
    ),
  ADD COLUMN IF NOT EXISTS delivery_error_code text
    CHECK (
      delivery_error_code IS NULL
      OR delivery_error_code ~ '^[0-9]{1,10}$'
    ),
  ADD COLUMN IF NOT EXISTS delivery_updated_at timestamptz;

CREATE TABLE IF NOT EXISTS public.sms_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL
    REFERENCES public.sms_messages(id) ON DELETE CASCADE,
  provider_message_sid text NOT NULL
    CHECK (provider_message_sid ~ '^SM[0-9A-Fa-f]{32}$'),
  message_status text NOT NULL
    CHECK (
      message_status IN (
        'queued', 'sending', 'sent', 'delivered',
        'undelivered', 'failed', 'invalid'
      )
    ),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[0-9]{1,10}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, message_status)
);

CREATE INDEX IF NOT EXISTS sms_delivery_events_created_idx
  ON public.sms_delivery_events(created_at DESC);

ALTER TABLE public.sms_delivery_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sms_delivery_events
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.commit_sms_inbound(
  _phone_hash text,
  _phone_ciphertext text,
  _provider_message_sid text,
  _body_digest text,
  _next_state jsonb,
  _reply_ciphertext text,
  _rate_limited_reply_ciphertext text,
  _delivery_receipt_token text,
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
  result jsonb;
BEGIN
  IF _delivery_receipt_token IS NULL
     OR _delivery_receipt_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  result := public.commit_sms_inbound(
    _phone_hash,
    _phone_ciphertext,
    _provider_message_sid,
    _body_digest,
    _next_state,
    _reply_ciphertext,
    _rate_limited_reply_ciphertext,
    _planning_kind,
    _expected_version
  );

  IF result->>'status' IN ('committed', 'rate_limited')
     AND result->'replyCiphertext' <> 'null'::jsonb THEN
    UPDATE public.sms_messages
       SET delivery_receipt_token = COALESCE(
         delivery_receipt_token,
         _delivery_receipt_token
       )
     WHERE provider_message_sid = _provider_message_sid;
  END IF;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_sms_delivery_status(
  _receipt_token text,
  _provider_message_sid text,
  _message_status text,
  _error_code text,
  _recipient_phone_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  message_row public.sms_messages%ROWTYPE;
  conflicting_message_id uuid;
  expected_phone_hash text;
  current_rank integer;
  incoming_rank integer;
BEGIN
  IF _receipt_token IS NULL
     OR _receipt_token !~ '^[0-9a-f]{64}$'
     OR _provider_message_sid IS NULL
     OR _provider_message_sid !~ '^SM[0-9A-Fa-f]{32}$'
     OR _message_status IS NULL
     OR _message_status NOT IN (
       'queued', 'sending', 'sent', 'delivered',
       'undelivered', 'failed', 'invalid'
     )
     OR (
       _error_code IS NOT NULL
       AND (
         _error_code !~ '^[0-9]{1,10}$'
         OR _message_status NOT IN ('failed', 'undelivered', 'invalid')
       )
     )
     OR (
       _recipient_phone_hash IS NOT NULL
       AND _recipient_phone_hash !~ '^[0-9a-f]{64}$'
     ) THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  SELECT *
    INTO message_row
    FROM public.sms_messages
   WHERE delivery_receipt_token = _receipt_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'unknown');
  END IF;

  IF _recipient_phone_hash IS NOT NULL THEN
    SELECT contact.phone_hash
      INTO expected_phone_hash
      FROM public.sms_conversations AS conversation
      JOIN public.sms_contacts AS contact
        ON contact.id = conversation.contact_id
     WHERE conversation.id = message_row.conversation_id;
    IF expected_phone_hash IS DISTINCT FROM _recipient_phone_hash THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
  END IF;

  -- Every callback for one outbound SID takes the same transaction lock,
  -- preventing two receipt rows from racing the unique constraint.
  PERFORM pg_advisory_xact_lock(hashtextextended(_provider_message_sid, 1));

  SELECT id
    INTO conflicting_message_id
    FROM public.sms_messages
   WHERE outbound_message_sid = _provider_message_sid
     AND id <> message_row.id
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  IF message_row.outbound_message_sid IS NOT NULL
     AND message_row.outbound_message_sid <> _provider_message_sid THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  IF message_row.delivery_status = _message_status THEN
    IF message_row.delivery_error_code IS NULL AND _error_code IS NOT NULL THEN
      UPDATE public.sms_messages
         SET delivery_error_code = _error_code,
             delivery_updated_at = now()
       WHERE id = message_row.id;
      UPDATE public.sms_delivery_events
         SET error_code = COALESCE(error_code, _error_code)
       WHERE message_id = message_row.id
         AND message_status = _message_status;
      RETURN jsonb_build_object('status', 'enriched');
    END IF;
    IF message_row.delivery_error_code IS NOT NULL
       AND _error_code IS NOT NULL
       AND message_row.delivery_error_code <> _error_code THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  -- SMS terminal states never regress.
  IF message_row.delivery_status IN (
    'delivered', 'undelivered', 'failed', 'invalid'
  ) THEN
    RETURN jsonb_build_object('status', 'out_of_order');
  END IF;

  current_rank := CASE message_row.delivery_status
    WHEN 'queued' THEN 10
    WHEN 'sending' THEN 20
    WHEN 'sent' THEN 30
    ELSE -1
  END;
  incoming_rank := CASE _message_status
    WHEN 'queued' THEN 10
    WHEN 'sending' THEN 20
    WHEN 'sent' THEN 30
    WHEN 'delivered' THEN 40
    WHEN 'undelivered' THEN 40
    WHEN 'failed' THEN 40
    WHEN 'invalid' THEN 40
  END;

  IF message_row.delivery_status IS NOT NULL
     AND incoming_rank <= current_rank THEN
    RETURN jsonb_build_object('status', 'out_of_order');
  END IF;

  UPDATE public.sms_messages
     SET outbound_message_sid = COALESCE(outbound_message_sid, _provider_message_sid),
         delivery_status = _message_status,
         delivery_error_code = _error_code,
         delivery_updated_at = now()
   WHERE id = message_row.id;

  INSERT INTO public.sms_delivery_events(
    message_id,
    provider_message_sid,
    message_status,
    error_code
  ) VALUES (
    message_row.id,
    _provider_message_sid,
    _message_status,
    _error_code
  )
  ON CONFLICT (message_id, message_status) DO NOTHING;

  RETURN jsonb_build_object('status', 'recorded');
END;
$$;

REVOKE ALL ON FUNCTION public.commit_sms_inbound(
  text, text, text, text, jsonb, text, text, text, text, bigint
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_sms_delivery_status(text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.commit_sms_inbound(
  text, text, text, text, jsonb, text, text, text, text, bigint
) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_sms_delivery_status(text, text, text, text, text)
  TO service_role;
