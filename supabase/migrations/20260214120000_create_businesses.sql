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

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  public_id text,
  business_name text,
  category text,
  description text,
  website text,
  phone text,
  profile_photo_url text,
  cover_photo_url text,
  address text,
  address_2 text,
  city text,
  state text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  hours_json jsonb,
  social_links_json jsonb,
  is_internal boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'pending',
  stripe_connected boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  risk_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS public_id text,
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS profile_photo_url text,
  ADD COLUMN IF NOT EXISTS cover_photo_url text,
  ADD COLUMN IF NOT EXISTS address_2 text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS hours_json jsonb,
  ADD COLUMN IF NOT EXISTS social_links_json jsonb,
  ADD COLUMN IF NOT EXISTS is_internal boolean,
  ADD COLUMN IF NOT EXISTS verification_status text,
  ADD COLUMN IF NOT EXISTS stripe_connected boolean,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS risk_flags jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'businesses'
      AND c.column_name = 'name'
  ) THEN
    EXECUTE $sql$
      UPDATE public.businesses
      SET business_name = COALESCE(business_name, name)
      WHERE business_name IS NULL
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'businesses'
      AND c.column_name = 'logo_url'
  ) THEN
    EXECUTE $sql$
      UPDATE public.businesses
      SET profile_photo_url = COALESCE(profile_photo_url, logo_url)
      WHERE profile_photo_url IS NULL
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'businesses'
      AND c.column_name = 'banner_url'
  ) THEN
    EXECUTE $sql$
      UPDATE public.businesses
      SET cover_photo_url = COALESCE(cover_photo_url, banner_url)
      WHERE cover_photo_url IS NULL
    $sql$;
  END IF;
END $$;

UPDATE public.businesses b
SET owner_user_id = b.id
WHERE b.owner_user_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM auth.users au
    WHERE au.id = b.id
  );

UPDATE public.businesses b
SET owner_user_id = u.id
FROM public.users u
WHERE b.owner_user_id IS NULL
  AND b.public_id IS NOT NULL
  AND lower(COALESCE(u.public_id, '')) = lower(b.public_id);

UPDATE public.businesses
SET name = COALESCE(name, business_name)
WHERE name IS NULL
  AND business_name IS NOT NULL;

UPDATE public.businesses
SET photo_url = COALESCE(photo_url, profile_photo_url)
WHERE photo_url IS NULL
  AND profile_photo_url IS NOT NULL;

UPDATE public.businesses
SET lat = latitude
WHERE lat IS NULL
  AND latitude IS NOT NULL;

UPDATE public.businesses
SET lng = longitude
WHERE lng IS NULL
  AND longitude IS NOT NULL;

UPDATE public.businesses
SET latitude = lat
WHERE latitude IS NULL
  AND lat IS NOT NULL;

UPDATE public.businesses
SET longitude = lng
WHERE longitude IS NULL
  AND lng IS NOT NULL;

UPDATE public.businesses
SET is_internal = false
WHERE is_internal IS NULL;

UPDATE public.businesses
SET verification_status = 'pending'
WHERE verification_status IS NULL
   OR btrim(verification_status) = '';

UPDATE public.businesses
SET stripe_connected = false
WHERE stripe_connected IS NULL;

UPDATE public.businesses
SET risk_flags = '{}'::jsonb
WHERE risk_flags IS NULL;

UPDATE public.businesses
SET created_at = now()
WHERE created_at IS NULL;

UPDATE public.businesses
SET updated_at = now()
WHERE updated_at IS NULL;

ALTER TABLE public.businesses
  ALTER COLUMN is_internal SET DEFAULT false,
  ALTER COLUMN verification_status SET DEFAULT 'pending',
  ALTER COLUMN stripe_connected SET DEFAULT false,
  ALTER COLUMN risk_flags SET DEFAULT '{}'::jsonb,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'businesses_owner_user_id_fkey'
      AND conrelid = 'public.businesses'::regclass
  ) THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'businesses_verification_status_valid'
      AND conrelid = 'public.businesses'::regclass
  ) THEN
    ALTER TABLE public.businesses
      DROP CONSTRAINT businesses_verification_status_valid;
  END IF;

  ALTER TABLE public.businesses
    ADD CONSTRAINT businesses_verification_status_valid
    CHECK (verification_status IN ('pending', 'auto_verified', 'manually_verified', 'suspended'));
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'set_row_updated_at'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    CREATE FUNCTION public.set_row_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      NEW.updated_at := now();
      RETURN NEW;
    END;
    $fn$;
  END IF;
END $$;

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS businesses_set_updated_at ON public.businesses;
CREATE TRIGGER businesses_set_updated_at
BEFORE UPDATE ON public.businesses
FOR EACH ROW
EXECUTE FUNCTION public.set_row_updated_at();

DROP POLICY IF EXISTS "Public read businesses" ON public.businesses;
DROP POLICY IF EXISTS "Businesses can read own row" ON public.businesses;
DROP POLICY IF EXISTS "Businesses can insert own row" ON public.businesses;
DROP POLICY IF EXISTS "Businesses can update own row" ON public.businesses;

CREATE POLICY "Businesses can read own row"
  ON public.businesses
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Businesses can insert own row"
  ON public.businesses
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Businesses can update own row"
  ON public.businesses
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses WHERE owner_user_id IS NULL
  ) THEN
    ALTER TABLE public.businesses
      ALTER COLUMN owner_user_id SET NOT NULL;
  END IF;
END $$;

ALTER TABLE public.businesses
  ALTER COLUMN is_internal SET NOT NULL,
  ALTER COLUMN verification_status SET NOT NULL,
  ALTER COLUMN stripe_connected SET NOT NULL,
  ALTER COLUMN risk_flags SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS businesses_owner_user_id_key
  ON public.businesses (owner_user_id)
  WHERE owner_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS businesses_public_id_key
  ON public.businesses (public_id)
  WHERE public_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS businesses_city_idx
  ON public.businesses (city);

CREATE INDEX IF NOT EXISTS businesses_category_idx
  ON public.businesses (category);
