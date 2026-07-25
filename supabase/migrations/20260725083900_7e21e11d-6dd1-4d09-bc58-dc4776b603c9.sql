-- Keep the public invite projection narrow and make Photo Drop's historical
-- `note` field compatible with the public `notes` contract. Invalid or
-- non-HTTPS destinations are omitted; the client validates provider hosts
-- again before rendering an anchor or QR code.

CREATE OR REPLACE FUNCTION public.get_rsvp_party(token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p public.parties%ROWTYPE;
  yes_count int := 0;
  maybe_count int := 0;
  total_count int := 0;
  guest jsonb;
  public_bring jsonb := '[]'::jsonb;
  public_updates jsonb := '[]'::jsonb;
  public_photo jsonb := NULL;
  item jsonb;
  upd jsonb;
  photo_provider text;
  photo_url text;
BEGIN
  SELECT * INTO p FROM public.parties WHERE rsvp_token = token LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF jsonb_typeof(p.guests) = 'array' THEN
    FOR guest IN SELECT * FROM jsonb_array_elements(p.guests) LOOP
      total_count := total_count + 1;
      IF guest->>'rsvp' = 'yes' THEN yes_count := yes_count + 1; END IF;
      IF guest->>'rsvp' = 'maybe' THEN maybe_count := maybe_count + 1; END IF;
    END LOOP;
  END IF;

  IF jsonb_typeof(p.bring_board) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(p.bring_board) LOOP
      public_bring := public_bring || jsonb_build_array(jsonb_build_object(
        'id', item->>'id',
        'category', item->>'category',
        'label', item->>'label',
        'qty', COALESCE((item->>'qty')::numeric, 1),
        'unit', item->>'unit',
        'status', COALESCE(item->>'status', 'open')
      ));
    END LOOP;
  END IF;

  IF jsonb_typeof(p.host_updates) = 'array' THEN
    FOR upd IN SELECT * FROM jsonb_array_elements(p.host_updates) LOOP
      public_updates := public_updates || jsonb_build_array(jsonb_build_object(
        'id', upd->>'id',
        'text', upd->>'text',
        'at', upd->>'at'
      ));
    END LOOP;
  END IF;

  IF p.photo_drop IS NOT NULL AND jsonb_typeof(p.photo_drop) = 'object' THEN
    photo_provider := p.photo_drop->>'provider';
    photo_url := btrim(p.photo_drop->>'url');
    IF photo_provider IN ('dropbox_request', 'google_photos', 'kululu', 'guestpix', 'custom')
       AND char_length(photo_url) BETWEEN 9 AND 2048
       AND photo_url ~* '^https://[^[:space:]/?#]+([/?#]|$)' THEN
      public_photo := jsonb_build_object(
        'provider', photo_provider,
        'label', left(nullif(btrim(p.photo_drop->>'label'), ''), 80),
        'url', photo_url,
        'notes', left(
          nullif(btrim(COALESCE(p.photo_drop->>'notes', p.photo_drop->>'note')), ''),
          160
        )
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'name', p.name,
    'date', p.date,
    'start_time', p.start_time,
    'location', p.location,
    'occasion', p.occasion,
    'theme_id', p.theme_id,
    'theme', p.theme,
    'host_note', p.host_note,
    'holiday_pack_id', p.holiday_pack_id,
    'host_updates', public_updates,
    'bring_board', public_bring,
    'photo_drop', public_photo,
    'yes_count', yes_count,
    'maybe_count', maybe_count,
    'total_count', total_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_rsvp_party(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rsvp_party(uuid) TO anon, authenticated, service_role;
