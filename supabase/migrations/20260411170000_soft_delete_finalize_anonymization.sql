SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;

CREATE OR REPLACE VIEW public.user_public_profiles AS
SELECT
  u.id AS user_id,
  CASE
    WHEN u.account_status = 'deleted' OR u.deleted_at IS NOT NULL OR u.anonymized_at IS NOT NULL
      THEN 'Deleted user'
    ELSE COALESCE(
      NULLIF(btrim(u.full_name), ''),
      NULLIF(btrim(u.business_name), ''),
      'User'
    )
  END AS display_name,
  CASE
    WHEN u.account_status = 'deleted' OR u.deleted_at IS NOT NULL OR u.anonymized_at IS NOT NULL
      THEN NULL
    ELSE NULLIF(btrim(u.profile_photo_url), '')
  END AS avatar_url
FROM public.users u;

ALTER VIEW public.user_public_profiles SET (security_invoker = false);

GRANT SELECT ON TABLE public.user_public_profiles TO anon;
GRANT SELECT ON TABLE public.user_public_profiles TO authenticated;
GRANT SELECT ON TABLE public.user_public_profiles TO service_role;

COMMENT ON VIEW public.user_public_profiles IS
  'Public-safe reviewer/business profile surface. Deleted users resolve to "Deleted user" with no avatar.';

NOTIFY pgrst, 'reload schema';