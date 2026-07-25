
-- Retrospective column for post-event reflection (host only, via existing RLS)
ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS retrospective jsonb;

-- Extend claim_bring_item to mint and return a claim secret (uuid) that
-- only the claimant's browser keeps. The secret is stored on the item as
-- `claimSecret`, and it is NEVER included in the public views.
CREATE OR REPLACE FUNCTION public.claim_bring_item(
  token uuid,
  item_id text,
  guest_name text,
  household_label text DEFAULT NULL,
  qty numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.parties%ROWTYPE;
  new_board jsonb := '[]'::jsonb;
  item jsonb;
  claimed boolean := false;
  clean_name text;
  clean_household text;
  new_secret uuid := gen_random_uuid();
BEGIN
  clean_name := btrim(coalesce(guest_name,''));
  IF length(clean_name) = 0 OR length(clean_name) > 80 THEN
    RAISE EXCEPTION 'invalid name';
  END IF;
  clean_household := NULLIF(btrim(coalesce(household_label,'')), '');
  IF clean_household IS NOT NULL AND length(clean_household) > 80 THEN
    RAISE EXCEPTION 'invalid household';
  END IF;

  SELECT * INTO p FROM public.parties WHERE rsvp_token = token LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'party not found'; END IF;

  IF jsonb_typeof(p.bring_board) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(p.bring_board) LOOP
      IF item->>'id' = item_id AND COALESCE(item->>'status','open') = 'open' THEN
        claimed := true;
        new_board := new_board || jsonb_build_array(
          item
          || jsonb_build_object(
            'status', 'claimed',
            'assigneeName', clean_name,
            'assigneeHousehold', clean_household,
            'qty', COALESCE(qty, (item->>'qty')::numeric, 1),
            'claimSecret', new_secret::text,
            'claimedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          )
        );
      ELSE
        new_board := new_board || jsonb_build_array(item);
      END IF;
    END LOOP;
  END IF;

  IF NOT claimed THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');
  END IF;

  UPDATE public.parties SET bring_board = new_board, updated_at = now() WHERE id = p.id;
  RETURN jsonb_build_object('ok', true, 'claimSecret', new_secret::text);
END;
$$;

-- Release now prefers the claim secret; falls back to name-match only when
-- no secret is stored on the item (legacy claims from before this change).
CREATE OR REPLACE FUNCTION public.release_bring_item(
  token uuid,
  item_id text,
  guest_name text,
  claim_secret text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.parties%ROWTYPE;
  new_board jsonb := '[]'::jsonb;
  item jsonb;
  released boolean := false;
  clean_name text;
  stored_secret text;
BEGIN
  clean_name := lower(btrim(coalesce(guest_name,'')));

  SELECT * INTO p FROM public.parties WHERE rsvp_token = token LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'party not found'; END IF;

  IF jsonb_typeof(p.bring_board) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(p.bring_board) LOOP
      stored_secret := item->>'claimSecret';
      IF item->>'id' = item_id
         AND COALESCE(item->>'status','open') = 'claimed'
         AND (
           (stored_secret IS NOT NULL AND claim_secret IS NOT NULL AND stored_secret = claim_secret)
           OR (stored_secret IS NULL AND length(clean_name) > 0
               AND lower(coalesce(item->>'assigneeName','')) = clean_name)
         )
      THEN
        released := true;
        new_board := new_board || jsonb_build_array(
          (item - 'assigneeName' - 'assigneeHousehold' - 'claimedAt' - 'claimSecret')
          || jsonb_build_object('status', 'open')
        );
      ELSE
        new_board := new_board || jsonb_build_array(item);
      END IF;
    END LOOP;
  END IF;

  IF released THEN
    UPDATE public.parties SET bring_board = new_board, updated_at = now() WHERE id = p.id;
  END IF;
  RETURN jsonb_build_object('ok', released);
END;
$$;

REVOKE ALL ON FUNCTION public.release_bring_item(uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.release_bring_item(uuid, text, text, text) TO anon, authenticated;
-- Old 3-arg signature no longer needed
DROP FUNCTION IF EXISTS public.release_bring_item(uuid, text, text);

-- list_bring_board must strip claimSecret from its public projection
CREATE OR REPLACE FUNCTION public.list_bring_board(token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.parties%ROWTYPE;
  out_items jsonb := '[]'::jsonb;
  item jsonb;
BEGIN
  SELECT * INTO p FROM public.parties WHERE rsvp_token = token LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF jsonb_typeof(p.bring_board) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(p.bring_board) LOOP
      out_items := out_items || jsonb_build_array(jsonb_build_object(
        'id', item->>'id',
        'category', item->>'category',
        'label', item->>'label',
        'qty', COALESCE((item->>'qty')::numeric, 1),
        'unit', item->>'unit',
        'dietaryTags', COALESCE(item->'dietaryTags', '[]'::jsonb),
        'status', COALESCE(item->>'status', 'open'),
        'assigneeName', item->>'assigneeName',
        'assigneeHousehold', item->>'assigneeHousehold',
        'notes', item->>'notes'
      ));
    END LOOP;
  END IF;
  RETURN out_items;
END;
$$;
