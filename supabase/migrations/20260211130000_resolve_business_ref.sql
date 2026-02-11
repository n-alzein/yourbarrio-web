SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Resolve UUID OR public_id -> business user uuid (public, business-only)
CREATE OR REPLACE FUNCTION public.resolve_business_ref(p_ref text)
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
  SELECT u.id, u.public_id
  FROM public.users u
  WHERE
    COALESCE(NULLIF(lower(u.role), ''), 'customer') = 'business'
    AND (
      (v_is_uuid AND u.id = v_ref::uuid)
      OR ((NOT v_is_uuid) AND lower(u.public_id) = v_ref)
    )
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_business_ref(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_business_ref(text) TO anon, authenticated;

