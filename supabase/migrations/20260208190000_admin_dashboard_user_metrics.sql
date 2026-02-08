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

CREATE OR REPLACE FUNCTION public.admin_total_users_count()
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  RETURN (
    SELECT count(*)::bigint
    FROM auth.users
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_total_users_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_total_users_count() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_user_signups_timeseries(p_days integer DEFAULT 30)
RETURNS TABLE (
  bucket_start date,
  customer_count bigint,
  business_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_days integer := GREATEST(COALESCE(p_days, 30), 1);
  v_start_date date := (timezone('utc', now()))::date - (v_days - 1);
  v_end_date date := (timezone('utc', now()))::date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  RETURN QUERY
  WITH buckets AS (
    SELECT generate_series(v_start_date, v_end_date, interval '1 day')::date AS bucket_start
  ),
  signups AS (
    SELECT
      (timezone('utc', au.created_at))::date AS bucket_start,
      sum(
        CASE
          WHEN COALESCE(NULLIF(lower(u.role), ''), 'customer') = 'business' THEN 1
          ELSE 0
        END
      )::bigint AS business_count,
      sum(
        CASE
          WHEN COALESCE(NULLIF(lower(u.role), ''), 'customer') = 'business' THEN 0
          ELSE 1
        END
      )::bigint AS customer_count
    FROM auth.users au
    LEFT JOIN public.users u ON u.id = au.id
    WHERE au.created_at >= v_start_date::timestamptz
      AND au.created_at < (v_end_date + 1)::timestamptz
    GROUP BY 1
  )
  SELECT
    b.bucket_start,
    COALESCE(s.customer_count, 0)::bigint AS customer_count,
    COALESCE(s.business_count, 0)::bigint AS business_count
  FROM buckets b
  LEFT JOIN signups s ON s.bucket_start = b.bucket_start
  ORDER BY b.bucket_start ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_signups_timeseries(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_user_signups_timeseries(integer) TO authenticated;
