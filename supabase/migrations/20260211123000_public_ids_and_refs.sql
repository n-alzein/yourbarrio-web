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

CREATE OR REPLACE FUNCTION public.generate_short_id()
RETURNS text
LANGUAGE sql
AS $$
  SELECT substr(encode(gen_random_bytes(6), 'hex'), 1, 12);
$$;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS public_id text;

UPDATE public.users
SET public_id = public.generate_short_id()
WHERE public_id IS NULL OR btrim(public_id) = '';

CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_key
  ON public.users(public_id);

ALTER TABLE public.users
  ALTER COLUMN public_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.set_users_public_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.public_id IS NULL OR btrim(NEW.public_id) = '' THEN
    NEW.public_id := public.generate_short_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_users_public_id ON public.users;
CREATE TRIGGER trg_set_users_public_id
BEFORE INSERT ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.set_users_public_id();

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS public_id text;

UPDATE public.listings
SET public_id = public.generate_short_id()
WHERE public_id IS NULL OR btrim(public_id) = '';

CREATE UNIQUE INDEX IF NOT EXISTS listings_public_id_key
  ON public.listings(public_id);

ALTER TABLE public.listings
  ALTER COLUMN public_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.set_listings_public_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.public_id IS NULL OR btrim(NEW.public_id) = '' THEN
    NEW.public_id := public.generate_short_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_listings_public_id ON public.listings;
CREATE TRIGGER trg_set_listings_public_id
BEFORE INSERT ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.set_listings_public_id();

DO $$
BEGIN
  IF to_regclass('public.business_reviews') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.business_reviews ADD COLUMN IF NOT EXISTS public_id text';
    EXECUTE 'UPDATE public.business_reviews SET public_id = public.generate_short_id() WHERE public_id IS NULL OR btrim(public_id) = ''''';
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS business_reviews_public_id_key ON public.business_reviews(public_id)';
    EXECUTE 'ALTER TABLE public.business_reviews ALTER COLUMN public_id SET NOT NULL';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_business_reviews_public_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.public_id IS NULL OR btrim(NEW.public_id) = '' THEN
    NEW.public_id := public.generate_short_id();
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.business_reviews') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_set_business_reviews_public_id ON public.business_reviews';
    EXECUTE 'CREATE TRIGGER trg_set_business_reviews_public_id BEFORE INSERT ON public.business_reviews FOR EACH ROW EXECUTE FUNCTION public.set_business_reviews_public_id()';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_resolve_user_ref(p_ref text)
RETURNS TABLE (
  id uuid,
  public_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text := lower(trim(COALESCE(p_ref, '')));
  v_is_uuid boolean;
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR (auth.uid() IS NOT NULL AND public.has_admin_role('admin_readonly'))
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF v_ref = '' THEN
    RETURN;
  END IF;

  v_is_uuid := v_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

  RETURN QUERY
  SELECT u.id, u.public_id
  FROM public.users u
  WHERE
    (v_is_uuid AND u.id = v_ref::uuid)
    OR ((NOT v_is_uuid) AND lower(u.public_id) = v_ref)
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_listing_ref(p_ref text)
RETURNS TABLE (
  id uuid,
  public_id text
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_ref text := lower(trim(COALESCE(p_ref, '')));
  v_is_uuid boolean;
BEGIN
  IF v_ref = '' THEN
    RETURN;
  END IF;

  v_is_uuid := v_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

  RETURN QUERY
  SELECT l.id, l.public_id
  FROM public.listings l
  WHERE
    (v_is_uuid AND l.id = v_ref::uuid)
    OR ((NOT v_is_uuid) AND lower(l.public_id) = v_ref)
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_accounts(
  p_role text DEFAULT 'all',
  p_internal boolean DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_from integer DEFAULT 0,
  p_to integer DEFAULT 19
)
RETURNS TABLE (
  id uuid,
  public_id text,
  email text,
  full_name text,
  phone text,
  business_name text,
  role text,
  is_internal boolean,
  city text,
  created_at timestamptz,
  admin_role_keys text[],
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := COALESCE(NULLIF(lower(trim(p_role)), ''), 'all');
  v_from integer := GREATEST(COALESCE(p_from, 0), 0);
  v_to integer := GREATEST(COALESCE(p_to, 19), 0);
  v_limit integer := GREATEST(v_to - v_from + 1, 0);
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR (auth.uid() IS NOT NULL AND public.is_admin())
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF v_role NOT IN ('all', 'customer', 'business', 'admin') THEN
    v_role := 'all';
  END IF;

  RETURN QUERY
  WITH role_members AS (
    SELECT
      arm.user_id,
      array_agg(DISTINCT arm.role_key ORDER BY arm.role_key)::text[] AS role_keys
    FROM public.admin_role_members arm
    GROUP BY arm.user_id
  ),
  base AS (
    SELECT
      u.id::uuid AS id,
      u.public_id::text AS public_id,
      u.email::text AS email,
      u.full_name::text AS full_name,
      u.phone::text AS phone,
      u.business_name::text AS business_name,
      COALESCE(NULLIF(lower(u.role), ''), 'customer')::text AS role,
      COALESCE(u.is_internal, false) AS is_internal,
      u.city::text AS city,
      u.created_at::timestamptz AS created_at,
      COALESCE(rm.role_keys, ARRAY[]::text[]) AS admin_role_keys,
      (
        COALESCE(NULLIF(lower(u.role), ''), 'customer') = 'admin'
        OR COALESCE(u.is_internal, false)
        OR cardinality(COALESCE(rm.role_keys, ARRAY[]::text[])) > 0
      ) AS account_is_admin
    FROM public.users u
    LEFT JOIN role_members rm
      ON rm.user_id = u.id
  ),
  filtered AS (
    SELECT *
    FROM base b
    WHERE
      CASE
        WHEN v_role = 'business' THEN b.role = 'business' AND b.account_is_admin = false
        WHEN v_role = 'customer' THEN b.role IN ('customer', 'user') AND b.account_is_admin = false
        WHEN v_role = 'admin' THEN b.account_is_admin = true
        ELSE true
      END
      AND (
        p_internal IS NULL
        OR b.is_internal = p_internal
      )
      AND (
        p_q IS NULL
        OR btrim(p_q) = ''
        OR (
          COALESCE(b.full_name, '') ILIKE '%' || p_q || '%'
          OR COALESCE(b.email, '') ILIKE '%' || p_q || '%'
          OR COALESCE(b.phone, '') ILIKE '%' || p_q || '%'
          OR COALESCE(b.business_name, '') ILIKE '%' || p_q || '%'
          OR COALESCE(b.public_id, '') ILIKE '%' || p_q || '%'
        )
      )
  ),
  counted AS (
    SELECT
      f.*,
      count(*) OVER () AS total_count
    FROM filtered f
  )
  SELECT
    c.id,
    c.public_id,
    c.email,
    c.full_name,
    c.phone,
    c.business_name,
    c.role,
    c.is_internal,
    c.city,
    c.created_at,
    c.admin_role_keys,
    c.total_count
  FROM counted c
  ORDER BY c.created_at DESC NULLS LAST
  OFFSET v_from
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_accounts(text, boolean, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_accounts(text, boolean, text, integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_resolve_user_ref(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_user_ref(text) TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_listing_ref(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_listing_ref(text) TO anon, authenticated;

