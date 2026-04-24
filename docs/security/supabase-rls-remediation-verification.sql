-- Supabase RLS remediation verification checklist
-- Run against staging first.

-- 1. admin_account_deletions exists and is protected
SELECT
  n.nspname AS schema_name,
  c.relname AS object_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'admin_account_deletions';

SELECT
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'admin_account_deletions'
ORDER BY ordinal_position;

SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'admin_account_deletions'
ORDER BY policyname;

SELECT
  'public.admin_account_deletions' AS object_name,
  has_table_privilege('anon', 'public.admin_account_deletions', 'SELECT') AS anon_select,
  has_table_privilege('authenticated', 'public.admin_account_deletions', 'SELECT') AS authenticated_select,
  has_table_privilege('service_role', 'public.admin_account_deletions', 'SELECT') AS service_role_select,
  has_table_privilege('anon', 'public.admin_account_deletions', 'INSERT') AS anon_insert,
  has_table_privilege('authenticated', 'public.admin_account_deletions', 'INSERT') AS authenticated_insert,
  has_table_privilege('service_role', 'public.admin_account_deletions', 'INSERT') AS service_role_insert;

-- 2. maintenance functions are no longer browser-callable
SELECT
  'public.invoke_finalize_overdue_deletions(text, integer)' AS function_name,
  has_function_privilege('anon', 'public.invoke_finalize_overdue_deletions(text, integer)', 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', 'public.invoke_finalize_overdue_deletions(text, integer)', 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role', 'public.invoke_finalize_overdue_deletions(text, integer)', 'EXECUTE') AS service_role_execute
UNION ALL
SELECT
  'public.schedule_finalize_overdue_deletions_job(text)',
  has_function_privilege('anon', 'public.schedule_finalize_overdue_deletions_job(text)', 'EXECUTE'),
  has_function_privilege('authenticated', 'public.schedule_finalize_overdue_deletions_job(text)', 'EXECUTE'),
  has_function_privilege('service_role', 'public.schedule_finalize_overdue_deletions_job(text)', 'EXECUTE')
UNION ALL
SELECT
  'public.unschedule_finalize_overdue_deletions_job()',
  has_function_privilege('anon', 'public.unschedule_finalize_overdue_deletions_job()', 'EXECUTE'),
  has_function_privilege('authenticated', 'public.unschedule_finalize_overdue_deletions_job()', 'EXECUTE'),
  has_function_privilege('service_role', 'public.unschedule_finalize_overdue_deletions_job()', 'EXECUTE')
UNION ALL
SELECT
  'public.list_finalize_overdue_deletions_jobs()',
  has_function_privilege('anon', 'public.list_finalize_overdue_deletions_jobs()', 'EXECUTE'),
  has_function_privilege('authenticated', 'public.list_finalize_overdue_deletions_jobs()', 'EXECUTE'),
  has_function_privilege('service_role', 'public.list_finalize_overdue_deletions_jobs()', 'EXECUTE');

-- 3. public_listings_v now uses invoker semantics
SELECT
  c.relname AS view_name,
  c.reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'public_listings_v';

SELECT
  pg_get_viewdef('public.public_listings_v'::regclass, true) AS view_definition;

SELECT
  column_name,
  ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'public_listings_v'
ORDER BY ordinal_position;

SELECT
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'listings'
      AND column_name = 'is_test'
  ) AS listings_has_is_test,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'public_listings_v'
      AND column_name = 'is_test'
  ) AS public_listings_view_has_is_test;

SELECT
  COUNT(*) AS public_listings_visible_count
FROM public.public_listings_v;

-- 4. user_public_profiles still exists and keeps owner-privileged behavior for now
SELECT
  c.relname AS view_name,
  c.reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'user_public_profiles';

SELECT
  pg_get_viewdef('public.user_public_profiles'::regclass, true) AS view_definition;

SELECT
  COUNT(*) AS email_like_public_profile_display_names
FROM public.user_public_profiles
WHERE COALESCE(NULLIF(BTRIM(display_name), ''), '') ~* '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$';

-- 5. confirm staging/production migration history before production rollout
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 10;
