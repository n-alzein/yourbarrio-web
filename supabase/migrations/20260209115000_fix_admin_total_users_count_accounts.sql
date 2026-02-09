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
    SELECT count(DISTINCT u.id)::bigint
    FROM public.users u
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_total_users_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_total_users_count() TO authenticated;
