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

CREATE OR REPLACE FUNCTION public.admin_list_audit_logs(
  p_q text DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  actor_user_id uuid,
  actor_name text,
  actor_email text,
  action text,
  target_type text,
  target_id text,
  target_name text,
  target_email text,
  target_label text,
  meta jsonb,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q text := NULLIF(trim(COALESCE(p_q, '')), '');
  v_action text := NULLIF(trim(COALESCE(p_action, '')), '');
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_admin_role('admin_readonly') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      l.*,
      COALESCE(l.target_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AS target_is_uuid
    FROM public.admin_audit_log l
    WHERE
      (v_action IS NULL OR l.action ILIKE '%' || v_action || '%')
      AND (p_from IS NULL OR l.created_at >= p_from)
      AND (p_to IS NULL OR l.created_at <= p_to)
  ),
  enriched AS (
    SELECT
      b.id,
      b.created_at,
      b.actor_user_id,
      NULLIF(trim(u_actor.full_name), '')::text AS actor_name,
      NULLIF(trim(u_actor.email), '')::text AS actor_email,
      b.action,
      b.target_type,
      b.target_id,
      CASE
        WHEN b.target_type = 'user' THEN NULLIF(trim(u_target.full_name), '')
        WHEN b.target_type = 'business' THEN NULLIF(trim(COALESCE(biz.business_name, biz.name)), '')
        WHEN b.target_type = 'listing' THEN NULLIF(trim(li.title), '')
        ELSE NULL
      END::text AS target_name,
      CASE
        WHEN b.target_type = 'user' THEN NULLIF(trim(u_target.email), '')
        ELSE NULL
      END::text AS target_email,
      CASE
        WHEN b.target_type = 'user' THEN COALESCE(
          CASE
            WHEN NULLIF(trim(u_target.full_name), '') IS NOT NULL AND NULLIF(trim(u_target.email), '') IS NOT NULL
              THEN trim(u_target.full_name) || ' <' || trim(u_target.email) || '>'
            WHEN NULLIF(trim(u_target.email), '') IS NOT NULL
              THEN trim(u_target.email)
            WHEN NULLIF(trim(u_target.full_name), '') IS NOT NULL
              THEN trim(u_target.full_name)
            ELSE NULL
          END,
          COALESCE(b.target_id, 'user:unknown')
        )
        WHEN b.target_type = 'business' THEN COALESCE(
          NULLIF(trim(COALESCE(biz.business_name, biz.name)), ''),
          CASE
            WHEN NULLIF(trim(COALESCE(biz.public_id, b.target_id)), '') IS NOT NULL
              THEN 'business: ' || trim(COALESCE(biz.public_id, b.target_id))
            ELSE 'business:unknown'
          END
        )
        WHEN b.target_type = 'listing' THEN COALESCE(
          NULLIF(trim(li.title), ''),
          CASE
            WHEN NULLIF(trim(COALESCE(li.public_id, b.target_id)), '') IS NOT NULL
              THEN 'listing: ' || trim(COALESCE(li.public_id, b.target_id))
            ELSE 'listing:unknown'
          END
        )
        ELSE COALESCE(
          NULLIF(trim(COALESCE(b.target_type, '')), '') || ':' || COALESCE(NULLIF(trim(b.target_id), ''), '-'),
          COALESCE(NULLIF(trim(b.target_id), ''), '-')
        )
      END::text AS target_label,
      b.meta
    FROM base b
    LEFT JOIN public.users u_actor
      ON u_actor.id = b.actor_user_id
    LEFT JOIN public.users u_target
      ON b.target_type = 'user'
      AND b.target_is_uuid
      AND u_target.id = b.target_id::uuid
    LEFT JOIN public.businesses biz
      ON b.target_type = 'business'
      AND (
        (b.target_is_uuid AND biz.id = b.target_id::uuid)
        OR lower(COALESCE(biz.public_id, '')) = lower(COALESCE(b.target_id, ''))
      )
    LEFT JOIN public.listings li
      ON b.target_type = 'listing'
      AND (
        (b.target_is_uuid AND li.id = b.target_id::uuid)
        OR lower(COALESCE(li.public_id, '')) = lower(COALESCE(b.target_id, ''))
      )
  )
  SELECT
    e.id,
    e.created_at,
    e.actor_user_id,
    e.actor_name,
    e.actor_email,
    e.action,
    e.target_type,
    e.target_id,
    e.target_name,
    e.target_email,
    e.target_label,
    e.meta,
    COUNT(*) OVER()::bigint AS total_count
  FROM enriched e
  WHERE
    v_q IS NULL
    OR COALESCE(e.action, '') ILIKE '%' || v_q || '%'
    OR COALESCE(e.actor_name, '') ILIKE '%' || v_q || '%'
    OR COALESCE(e.actor_email, '') ILIKE '%' || v_q || '%'
    OR COALESCE(e.target_name, '') ILIKE '%' || v_q || '%'
    OR COALESCE(e.target_email, '') ILIKE '%' || v_q || '%'
    OR COALESCE(e.target_label, '') ILIKE '%' || v_q || '%'
    OR COALESCE(e.target_id, '') ILIKE '%' || v_q || '%'
  ORDER BY e.created_at DESC, e.id DESC
  OFFSET v_offset
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_audit_logs(text, text, timestamptz, timestamptz, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_logs(text, text, timestamptz, timestamptz, integer, integer) TO authenticated;
