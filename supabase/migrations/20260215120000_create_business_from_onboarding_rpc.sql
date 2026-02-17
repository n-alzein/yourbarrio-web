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

CREATE OR REPLACE FUNCTION public.create_business_from_onboarding(p_payload jsonb)
RETURNS TABLE (
  business_id uuid,
  public_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text := NULLIF(trim(COALESCE(p_payload->>'name', '')), '');
  v_category text := NULLIF(trim(COALESCE(p_payload->>'category', '')), '');
  v_description text := NULLIF(trim(COALESCE(p_payload->>'description', '')), '');
  v_address text := NULLIF(trim(COALESCE(p_payload->>'address', '')), '');
  v_address_2 text := NULLIF(trim(COALESCE(p_payload->>'address_2', '')), '');
  v_city text := NULLIF(trim(COALESCE(p_payload->>'city', '')), '');
  v_state text := upper(NULLIF(trim(COALESCE(p_payload->>'state', '')), ''));
  v_postal_code text := NULLIF(trim(COALESCE(p_payload->>'postal_code', '')), '');
  v_phone text := NULLIF(trim(COALESCE(p_payload->>'phone', '')), '');
  v_website text := NULLIF(trim(COALESCE(p_payload->>'website', '')), '');
  v_latitude double precision := NULLIF(p_payload->>'latitude', '')::double precision;
  v_longitude double precision := NULLIF(p_payload->>'longitude', '')::double precision;
  v_user_public_id text;
  v_is_internal boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be authenticated';
  END IF;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Business name is required';
  END IF;
  IF v_category IS NULL THEN
    RAISE EXCEPTION 'Category is required';
  END IF;
  IF v_address IS NULL OR v_city IS NULL OR v_state IS NULL OR v_postal_code IS NULL THEN
    RAISE EXCEPTION 'Address, city, state, and postal code are required';
  END IF;

  SELECT u.public_id, COALESCE(u.is_internal, false)
  INTO v_user_public_id, v_is_internal
  FROM public.users u
  WHERE u.id = v_uid;

  v_user_public_id := COALESCE(v_user_public_id, public.generate_short_id());

  INSERT INTO public.users (
    id,
    role,
    public_id,
    full_name,
    business_name,
    category,
    description,
    address,
    address_2,
    city,
    state,
    postal_code,
    phone,
    website,
    latitude,
    longitude,
    is_internal
  )
  VALUES (
    v_uid,
    'business',
    v_user_public_id,
    v_name,
    v_name,
    v_category,
    v_description,
    v_address,
    v_address_2,
    v_city,
    v_state,
    v_postal_code,
    v_phone,
    v_website,
    v_latitude,
    v_longitude,
    v_is_internal
  )
  ON CONFLICT (id) DO UPDATE SET
    role = 'business',
    full_name = EXCLUDED.full_name,
    business_name = EXCLUDED.business_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    address = EXCLUDED.address,
    address_2 = EXCLUDED.address_2,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    postal_code = EXCLUDED.postal_code,
    phone = EXCLUDED.phone,
    website = EXCLUDED.website,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude;

  INSERT INTO public.businesses (
    owner_user_id,
    public_id,
    business_name,
    category,
    description,
    website,
    phone,
    address,
    address_2,
    city,
    state,
    postal_code,
    latitude,
    longitude,
    is_internal,
    verification_status,
    stripe_connected
  )
  VALUES (
    v_uid,
    v_user_public_id,
    v_name,
    v_category,
    v_description,
    v_website,
    v_phone,
    v_address,
    v_address_2,
    v_city,
    v_state,
    v_postal_code,
    v_latitude,
    v_longitude,
    v_is_internal,
    'pending',
    false
  )
  ON CONFLICT (owner_user_id) DO UPDATE SET
    owner_user_id = EXCLUDED.owner_user_id
  RETURNING businesses.id, businesses.public_id
  INTO business_id, public_id;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_business_from_onboarding(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_business_from_onboarding(jsonb) TO authenticated;

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Businesses can insert own row" ON public.businesses;
