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

DROP FUNCTION IF EXISTS public.admin_list_accounts(text, boolean, text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_list_accounts(
  p_role text DEFAULT 'all',
  p_internal boolean DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_from integer DEFAULT 0,
  p_to integer DEFAULT 19
)
RETURNS TABLE (
  id uuid,
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
