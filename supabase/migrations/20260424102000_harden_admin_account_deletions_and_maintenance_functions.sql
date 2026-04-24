SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;

ALTER TABLE IF EXISTS public.admin_account_deletions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_account_deletions FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_account_deletions FROM anon;
REVOKE ALL ON TABLE public.admin_account_deletions FROM authenticated;
GRANT ALL ON TABLE public.admin_account_deletions TO service_role;

COMMENT ON TABLE public.admin_account_deletions IS
  'Internal-only account deletion audit/workflow table. Browser-facing roles are revoked; service-role access retained.';

REVOKE EXECUTE ON FUNCTION public.invoke_finalize_overdue_deletions(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.schedule_finalize_overdue_deletions_job(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unschedule_finalize_overdue_deletions_job() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_finalize_overdue_deletions_jobs() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.invoke_finalize_overdue_deletions(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.schedule_finalize_overdue_deletions_job(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unschedule_finalize_overdue_deletions_job() TO service_role;
GRANT EXECUTE ON FUNCTION public.list_finalize_overdue_deletions_jobs() TO service_role;
