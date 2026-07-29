-- Trusted cohost collaboration and Firebase migration control plane.
--
-- Product boundary:
--   * owner + cohost are trusted, full-party collaborators;
--   * viewer is deliberately not offered while private guest/budget data lives
--     in the same parties row;
--   * RSVP credentials and collaborator credentials remain separate;
--   * migration ledgers are service-role only and never store source payloads,
--     emails, or plaintext legacy event codes.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Reconcile columns present in the generated remote types but previously
-- missing from checked-in migrations. They are explicit here so a clean
-- database and the connected schema cannot silently diverge.
ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS time_zone text,
  ADD COLUMN IF NOT EXISTS import_local_id text;
ALTER TABLE public.gathering_drafts
  ADD COLUMN IF NOT EXISTS import_idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS parties_user_import_local_id_key
  ON public.parties (user_id, import_local_id)
  WHERE import_local_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS gathering_drafts_user_import_key
  ON public.gathering_drafts (user_id, import_idempotency_key)
  WHERE import_idempotency_key IS NOT NULL;

CREATE TABLE public.party_memberships (
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'cohost')),
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (party_id, user_id)
);

CREATE UNIQUE INDEX party_memberships_one_owner
  ON public.party_memberships (party_id)
  WHERE role = 'owner';
CREATE INDEX party_memberships_user_id_idx
  ON public.party_memberships (user_id, party_id);

COMMENT ON TABLE public.party_memberships IS
  'Trusted full-party collaborators. Viewer access is intentionally deferred until a private projection exists.';

-- Existing rows receive an owner membership before party RLS changes.
INSERT INTO public.party_memberships (party_id, user_id, role)
SELECT id, user_id, 'owner'
FROM public.parties
ON CONFLICT (party_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.current_party_role(_party_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT role
  FROM public.party_memberships
  WHERE party_id = _party_id
    AND user_id = auth.uid()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_party_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_party_role(uuid) TO authenticated, service_role;

ALTER TABLE public.party_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.party_memberships FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.party_memberships TO authenticated;
GRANT ALL ON public.party_memberships TO service_role;

CREATE POLICY "Party collaborators can view memberships"
  ON public.party_memberships FOR SELECT
  TO authenticated
  USING (public.current_party_role(party_id) IN ('owner', 'cohost'));

-- Replace the single-owner party policies with membership-aware policies.
DROP POLICY IF EXISTS "Users can view their own parties" ON public.parties;
DROP POLICY IF EXISTS "Users can insert their own parties" ON public.parties;
DROP POLICY IF EXISTS "Users can update their own parties" ON public.parties;
DROP POLICY IF EXISTS "Users can delete their own parties" ON public.parties;

CREATE POLICY "Party collaborators can view parties"
  ON public.parties FOR SELECT
  TO authenticated
  USING (public.current_party_role(id) IN ('owner', 'cohost'));

CREATE POLICY "Users can create their own parties"
  ON public.parties FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners and cohosts can update party plans"
  ON public.parties FOR UPDATE
  TO authenticated
  USING (public.current_party_role(id) IN ('owner', 'cohost'))
  WITH CHECK (public.current_party_role(id) IN ('owner', 'cohost'));

CREATE POLICY "Only owners can delete parties"
  ON public.parties FOR DELETE
  TO authenticated
  USING (public.current_party_role(id) = 'owner');

-- A cohost may update planning columns, but never identity, ownership,
-- migration keys, timestamps, or RSVP authority.
REVOKE UPDATE ON public.parties FROM authenticated;
GRANT UPDATE (
  name, occasion, date, start_time, location, guest_estimate, budget, theme,
  theme_id, tasks, guests, budget_categories, shopping_items, timeline,
  pinned_inspiration, host_note, households, bring_board, host_updates,
  holiday_pack_id, planning_profile, photo_drop, checkins, retrospective,
  time_zone
) ON public.parties TO authenticated;

CREATE OR REPLACE FUNCTION public.add_owner_membership_for_party()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.party_memberships (party_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner')
  ON CONFLICT (party_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.add_owner_membership_for_party() FROM PUBLIC;

CREATE TRIGGER add_owner_membership_after_party_insert
  AFTER INSERT ON public.parties
  FOR EACH ROW EXECUTE FUNCTION public.add_owner_membership_for_party();

CREATE OR REPLACE FUNCTION public.protect_party_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     AND current_setting('confetti.allow_owner_transfer', true) IS DISTINCT FROM 'on'
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'owner transfer required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_party_owner_before_update
  BEFORE UPDATE OF user_id ON public.parties
  FOR EACH ROW EXECUTE FUNCTION public.protect_party_owner();

CREATE TABLE public.party_collaboration_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'cohost' CHECK (role = 'cohost'),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  token_hint text NOT NULL CHECK (char_length(token_hint) = 6),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE INDEX party_collaboration_invitations_party_idx
  ON public.party_collaboration_invitations (party_id, created_at DESC);

ALTER TABLE public.party_collaboration_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.party_collaboration_invitations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.party_collaboration_invitations TO service_role;

CREATE OR REPLACE FUNCTION public.collaboration_token_hash(_token uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, extensions
AS $$
  SELECT encode(extensions.digest(_token::text, 'sha256'), 'hex')
$$;

REVOKE ALL ON FUNCTION public.collaboration_token_hash(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.collaboration_token_hash(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.list_party_people(_party_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller_role text := public.current_party_role(_party_id);
BEGIN
  IF caller_role NOT IN ('owner', 'cohost') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN jsonb_build_object(
    'callerRole', caller_role,
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'userId', m.user_id,
        'role', m.role,
        'displayName', m.display_name,
        'joinedAt', m.joined_at,
        'isYou', m.user_id = auth.uid()
      ) ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, m.joined_at)
      FROM public.party_memberships m
      WHERE m.party_id = _party_id
    ), '[]'::jsonb),
    'invitations', CASE WHEN caller_role = 'owner' THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id,
        'role', i.role,
        'tokenHint', i.token_hint,
        'createdAt', i.created_at,
        'expiresAt', i.expires_at,
        'acceptedAt', i.accepted_at,
        'revokedAt', i.revoked_at,
        'status', CASE
          WHEN i.revoked_at IS NOT NULL THEN 'revoked'
          WHEN i.accepted_at IS NOT NULL THEN 'accepted'
          WHEN i.expires_at <= now() THEN 'expired'
          ELSE 'pending'
        END
      ) ORDER BY i.created_at DESC)
      FROM public.party_collaboration_invitations i
      WHERE i.party_id = _party_id
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_collaboration_invite(
  _party_id uuid,
  _expires_in_hours integer DEFAULT 168
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  raw_token uuid := gen_random_uuid();
  invitation_id uuid;
  expiry timestamptz;
BEGIN
  IF public.current_party_role(_party_id) <> 'owner' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _expires_in_hours < 1 OR _expires_in_hours > 720 THEN
    RAISE EXCEPTION 'invalid expiry';
  END IF;

  expiry := now() + make_interval(hours => _expires_in_hours);
  INSERT INTO public.party_collaboration_invitations (
    party_id, token_hash, token_hint, created_by, expires_at
  ) VALUES (
    _party_id,
    public.collaboration_token_hash(raw_token),
    right(raw_token::text, 6),
    auth.uid(),
    expiry
  )
  RETURNING id INTO invitation_id;

  -- The raw bearer is returned exactly once and never stored.
  RETURN jsonb_build_object(
    'id', invitation_id,
    'token', raw_token,
    'expiresAt', expiry
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_collaboration_invite(
  _token uuid,
  _display_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  invitation public.party_collaboration_invitations%ROWTYPE;
  existing_role text;
  clean_display_name text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF COALESCE(_display_name, '') ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid display name';
  END IF;
  clean_display_name := regexp_replace(btrim(COALESCE(_display_name, '')), '\s+', ' ', 'g');
  IF char_length(clean_display_name) < 1
     OR char_length(clean_display_name) > 80
  THEN
    RAISE EXCEPTION 'invalid display name';
  END IF;

  SELECT * INTO invitation
  FROM public.party_collaboration_invitations
  WHERE token_hash = public.collaboration_token_hash(_token)
  FOR UPDATE;

  IF invitation.id IS NULL
     OR invitation.revoked_at IS NOT NULL
     OR invitation.expires_at <= now() THEN
    RAISE EXCEPTION 'invite unavailable';
  END IF;

  SELECT role INTO existing_role
  FROM public.party_memberships
  WHERE party_id = invitation.party_id AND user_id = caller_id;

  IF invitation.accepted_at IS NOT NULL THEN
    IF invitation.accepted_by = caller_id AND existing_role IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', true,
        'partyId', invitation.party_id,
        'role', existing_role,
        'alreadyAccepted', true
      );
    END IF;
    RAISE EXCEPTION 'invite unavailable';
  END IF;

  INSERT INTO public.party_memberships (party_id, user_id, role, display_name)
  VALUES (invitation.party_id, caller_id, invitation.role, clean_display_name)
  ON CONFLICT (party_id, user_id) DO UPDATE
    SET role = CASE
      WHEN public.party_memberships.role = 'owner' THEN 'owner'
      ELSE EXCLUDED.role
    END,
    joined_at = CASE
      WHEN public.party_memberships.role = 'owner'
        THEN public.party_memberships.joined_at
      ELSE now()
    END,
    display_name = CASE
      WHEN public.party_memberships.role = 'owner'
        THEN public.party_memberships.display_name
      ELSE clean_display_name
    END;

  UPDATE public.party_collaboration_invitations
  SET accepted_at = now(), accepted_by = caller_id
  WHERE id = invitation.id;

  SELECT role INTO existing_role
  FROM public.party_memberships
  WHERE party_id = invitation.party_id AND user_id = caller_id;

  RETURN jsonb_build_object(
    'ok', true,
    'partyId', invitation.party_id,
    'role', existing_role,
    'alreadyAccepted', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_collaboration_invite(
  _party_id uuid,
  _invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.current_party_role(_party_id) <> 'owner' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.party_collaboration_invitations
  SET revoked_at = COALESCE(revoked_at, now())
  WHERE id = _invitation_id
    AND party_id = _party_id
    AND accepted_at IS NULL;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_party_member(
  _party_id uuid,
  _user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.current_party_role(_party_id) <> 'owner' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'transfer ownership first';
  END IF;

  DELETE FROM public.party_memberships
  WHERE party_id = _party_id
    AND user_id = _user_id
    AND role = 'cohost';

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_party(_party_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.current_party_role(_party_id) <> 'cohost' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  DELETE FROM public.party_memberships
  WHERE party_id = _party_id AND user_id = auth.uid() AND role = 'cohost';

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_party_ownership(
  _party_id uuid,
  _new_owner_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  locked_party public.parties%ROWTYPE;
BEGIN
  SELECT * INTO locked_party
  FROM public.parties
  WHERE id = _party_id
  FOR UPDATE;

  IF locked_party.id IS NULL OR locked_party.user_id <> caller_id
     OR public.current_party_role(_party_id) <> 'owner' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.party_memberships
    WHERE party_id = _party_id AND user_id = _new_owner_id AND role = 'cohost'
  ) THEN
    RAISE EXCEPTION 'new owner must be an active cohost';
  END IF;

  PERFORM set_config('confetti.allow_owner_transfer', 'on', true);
  UPDATE public.parties SET user_id = _new_owner_id WHERE id = _party_id;
  UPDATE public.party_memberships
  SET role = 'cohost'
  WHERE party_id = _party_id AND user_id = caller_id;
  UPDATE public.party_memberships
  SET role = 'owner'
  WHERE party_id = _party_id AND user_id = _new_owner_id;

  RETURN jsonb_build_object('ok', true, 'partyId', _party_id);
END;
$$;

REVOKE ALL ON FUNCTION public.list_party_people(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_collaboration_invite(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_collaboration_invite(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_collaboration_invite(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_party_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_party(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transfer_party_ownership(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_party_people(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_collaboration_invite(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_collaboration_invite(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_collaboration_invite(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_party_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_party(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_party_ownership(uuid, uuid) TO authenticated;

-- Migration identity links are keyed by Firebase project + UID hash. Email is
-- intentionally absent. Only the service role can populate or inspect them.
CREATE TABLE public.external_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL CHECK (source_system = 'firebase'),
  source_tenant text NOT NULL CHECK (char_length(source_tenant) BETWEEN 1 AND 128),
  external_subject_hash text NOT NULL CHECK (external_subject_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'conflict', 'revoked')),
  proof_method text CHECK (
    proof_method IS NULL OR proof_method IN ('firebase-id-token', 'admin-recovery')
  ),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_system, source_tenant, external_subject_hash),
  UNIQUE (user_id, source_system, source_tenant),
  CHECK (
    (status = 'verified' AND user_id IS NOT NULL AND proof_method IS NOT NULL AND verified_at IS NOT NULL)
    OR status <> 'verified'
  )
);

CREATE TABLE public.migration_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL CHECK (source_system = 'firebase'),
  source_tenant text NOT NULL,
  snapshot_at timestamptz NOT NULL,
  exporter_version text NOT NULL,
  field_map_version text NOT NULL,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'running', 'reconciled', 'failed', 'rolled_back')),
  source_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_hashes jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_hashes jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(source_counts) = 'object'),
  CHECK (jsonb_typeof(source_hashes) = 'object'),
  CHECK (jsonb_typeof(target_counts) = 'object'),
  CHECK (jsonb_typeof(target_hashes) = 'object')
);

CREATE TABLE public.migration_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.migration_runs(id) ON DELETE RESTRICT,
  entity_kind text NOT NULL,
  source_key_hmac text NOT NULL CHECK (source_key_hmac ~ '^[0-9a-f]{64}$'),
  source_updated_at timestamptz,
  source_payload_hash text NOT NULL CHECK (source_payload_hash ~ '^[0-9a-f]{64}$'),
  target_kind text,
  target_id uuid,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'imported', 'verified', 'quarantined', 'failed', 'retired')),
  error_code text,
  imported_at timestamptz,
  UNIQUE (run_id, entity_kind, source_key_hmac)
);

CREATE UNIQUE INDEX migration_records_verified_source_once
  ON public.migration_records (entity_kind, source_key_hmac)
  WHERE status = 'verified';

ALTER TABLE public.external_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.external_identities FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.migration_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.migration_records FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.external_identities TO service_role;
GRANT ALL ON public.migration_runs TO service_role;
GRANT ALL ON public.migration_records TO service_role;

-- Shared parties cannot disappear as an account-deletion side effect. Owners
-- must remove cohosts/delete the party or transfer ownership first.
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, public
AS $$
DECLARE
  uid uuid := auth.uid();
  claims jsonb := auth.jwt();
  authenticated_at_epoch bigint;
  authenticated_at timestamptz;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  BEGIN
    SELECT max((method->>'timestamp')::bigint)
      INTO authenticated_at_epoch
      FROM jsonb_array_elements(COALESCE(claims->'amr', '[]'::jsonb)) AS method
     WHERE method->>'method' IN (
       'password','oauth','otp','totp','magiclink','recovery',
       'email/signup','invite','sso/saml'
     );
  EXCEPTION WHEN others THEN
    authenticated_at_epoch := NULL;
  END;
  IF authenticated_at_epoch IS NULL THEN
    RAISE EXCEPTION 'reauth required';
  END IF;
  authenticated_at := to_timestamp(authenticated_at_epoch);
  IF authenticated_at > now() + interval '1 minute'
     OR now() - authenticated_at > interval '15 minutes' THEN
    RAISE EXCEPTION 'reauth required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.party_memberships owned
    WHERE owned.user_id = uid
      AND owned.role = 'owner'
      AND EXISTS (
        SELECT 1 FROM public.party_memberships shared
        WHERE shared.party_id = owned.party_id AND shared.role = 'cohost'
      )
  ) THEN
    RAISE EXCEPTION 'shared parties require transfer';
  END IF;

  DELETE FROM auth.users WHERE id = uid;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
