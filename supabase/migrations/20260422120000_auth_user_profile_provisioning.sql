-- Keep public.users in sync with Supabase Auth users.
-- The app also has a server-side fallback, but this trigger is the primary
-- provisioning path for newly-created OAuth/password/magic-link accounts.

CREATE OR REPLACE FUNCTION public.handle_auth_user_profile_provisioning()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role text;
  v_full_name text;
  v_avatar_url text;
BEGIN
  v_role := lower(coalesce(
    NEW.raw_user_meta_data ->> 'role',
    NEW.raw_app_meta_data ->> 'role',
    'customer'
  ));

  IF v_role NOT IN ('customer', 'business', 'admin') THEN
    v_role := 'customer';
  END IF;

  v_full_name := coalesce(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    ''
  );

  v_avatar_url := coalesce(
    NEW.raw_user_meta_data ->> 'avatar_url',
    NEW.raw_user_meta_data ->> 'picture',
    NEW.raw_user_meta_data ->> 'profile_photo_url'
  );

  INSERT INTO public.users (
    id,
    email,
    role,
    full_name,
    profile_photo_url,
    updated_at
  )
  VALUES (
    NEW.id,
    lower(NEW.email),
    v_role,
    v_full_name,
    v_avatar_url,
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = CASE
      WHEN
        public.users.email ILIKE 'deleted+%@deleted.local'
        OR public.users.email ILIKE 'deleted+%@yourbarrio.invalid'
        OR public.users.full_name = 'Deleted user'
        OR public.users.business_name = 'Deleted user'
        OR public.users.account_status = 'deleted'
        OR public.users.deleted_at IS NOT NULL
        OR public.users.anonymized_at IS NOT NULL
      THEN EXCLUDED.email
      ELSE coalesce(public.users.email, EXCLUDED.email)
    END,
    full_name = CASE
      WHEN
        public.users.email ILIKE 'deleted+%@deleted.local'
        OR public.users.email ILIKE 'deleted+%@yourbarrio.invalid'
        OR public.users.full_name = 'Deleted user'
        OR public.users.business_name = 'Deleted user'
        OR public.users.account_status = 'deleted'
        OR public.users.deleted_at IS NOT NULL
        OR public.users.anonymized_at IS NOT NULL
      THEN EXCLUDED.full_name
      ELSE coalesce(nullif(public.users.full_name, ''), EXCLUDED.full_name)
    END,
    profile_photo_url = CASE
      WHEN
        public.users.email ILIKE 'deleted+%@deleted.local'
        OR public.users.email ILIKE 'deleted+%@yourbarrio.invalid'
        OR public.users.full_name = 'Deleted user'
        OR public.users.business_name = 'Deleted user'
        OR public.users.account_status = 'deleted'
        OR public.users.deleted_at IS NOT NULL
        OR public.users.anonymized_at IS NOT NULL
      THEN EXCLUDED.profile_photo_url
      ELSE coalesce(public.users.profile_photo_url, EXCLUDED.profile_photo_url)
    END,
    business_name = CASE
      WHEN public.users.business_name = 'Deleted user' THEN NULL
      ELSE public.users.business_name
    END,
    account_status = CASE
      WHEN
        public.users.email ILIKE 'deleted+%@deleted.local'
        OR public.users.email ILIKE 'deleted+%@yourbarrio.invalid'
        OR public.users.full_name = 'Deleted user'
        OR public.users.business_name = 'Deleted user'
        OR public.users.account_status = 'deleted'
        OR public.users.deleted_at IS NOT NULL
        OR public.users.anonymized_at IS NOT NULL
      THEN 'active'
      ELSE public.users.account_status
    END,
    deleted_at = CASE
      WHEN
        public.users.email ILIKE 'deleted+%@deleted.local'
        OR public.users.email ILIKE 'deleted+%@yourbarrio.invalid'
        OR public.users.full_name = 'Deleted user'
        OR public.users.business_name = 'Deleted user'
        OR public.users.account_status = 'deleted'
        OR public.users.deleted_at IS NOT NULL
        OR public.users.anonymized_at IS NOT NULL
      THEN NULL
      ELSE public.users.deleted_at
    END,
    anonymized_at = CASE
      WHEN
        public.users.email ILIKE 'deleted+%@deleted.local'
        OR public.users.email ILIKE 'deleted+%@yourbarrio.invalid'
        OR public.users.full_name = 'Deleted user'
        OR public.users.business_name = 'Deleted user'
        OR public.users.account_status = 'deleted'
        OR public.users.deleted_at IS NOT NULL
        OR public.users.anonymized_at IS NOT NULL
      THEN NULL
      ELSE public.users.anonymized_at
    END,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_profile_provisioning ON auth.users;

CREATE TRIGGER on_auth_user_profile_provisioning
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_auth_user_profile_provisioning();

INSERT INTO public.users (
  id,
  email,
  role,
  full_name,
  profile_photo_url,
  updated_at
)
SELECT
  au.id,
  lower(au.email),
  CASE
    WHEN lower(coalesce(au.raw_user_meta_data ->> 'role', au.raw_app_meta_data ->> 'role')) IN ('customer', 'business', 'admin')
      THEN lower(coalesce(au.raw_user_meta_data ->> 'role', au.raw_app_meta_data ->> 'role'))
    ELSE 'customer'
  END,
  coalesce(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name', ''),
  coalesce(
    au.raw_user_meta_data ->> 'avatar_url',
    au.raw_user_meta_data ->> 'picture',
    au.raw_user_meta_data ->> 'profile_photo_url'
  ),
  now()
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE
  pu.id IS NULL
  OR pu.email ILIKE 'deleted+%@deleted.local'
  OR pu.email ILIKE 'deleted+%@yourbarrio.invalid'
  OR pu.full_name = 'Deleted user'
  OR pu.business_name = 'Deleted user'
  OR pu.account_status = 'deleted'
  OR pu.deleted_at IS NOT NULL
  OR pu.anonymized_at IS NOT NULL;
