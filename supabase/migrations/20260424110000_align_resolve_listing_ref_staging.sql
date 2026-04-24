-- Staging-first draft.
-- Align public.resolve_listing_ref(text) with the current production definition.
-- Do not apply to production from this draft without a separate rollout decision.

CREATE OR REPLACE FUNCTION public.resolve_listing_ref(p_ref text)
RETURNS TABLE (
  id uuid,
  public_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text := lower(trim(COALESCE(p_ref, '')));
  v_is_uuid boolean;
BEGIN
  IF v_ref = '' THEN
    RETURN;
  END IF;

  v_is_uuid := v_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  RETURN QUERY
  SELECT l.id, l.public_id
  FROM public.listings l
  WHERE
    (v_is_uuid AND l.id = v_ref::uuid)
    OR ((NOT v_is_uuid) AND lower(l.public_id) = v_ref)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_listing_ref(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_listing_ref(text) TO anon, authenticated;
