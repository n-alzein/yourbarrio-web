SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;

REVOKE EXECUTE ON FUNCTION public.invoke_finalize_overdue_deletions(text, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.schedule_finalize_overdue_deletions_job(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unschedule_finalize_overdue_deletions_job() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_finalize_overdue_deletions_jobs() FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.invoke_finalize_overdue_deletions(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.schedule_finalize_overdue_deletions_job(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unschedule_finalize_overdue_deletions_job() TO service_role;
GRANT EXECUTE ON FUNCTION public.list_finalize_overdue_deletions_jobs() TO service_role;
