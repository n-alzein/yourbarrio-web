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

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read listings" ON public.listings;
DROP POLICY IF EXISTS "allow reading listings" ON public.listings;
DROP POLICY IF EXISTS "Public can read verified listings" ON public.listings;

DO $$
DECLARE
  has_is_published boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'listings'
      AND c.column_name = 'is_published'
  ) INTO has_is_published;

  IF has_is_published THEN
    EXECUTE $sql$
      CREATE POLICY "Public can read verified listings"
        ON public.listings
        FOR SELECT
        TO anon, authenticated
        USING (
          is_published = true
          AND EXISTS (
            SELECT 1
            FROM public.businesses b
            WHERE b.owner_user_id = listings.business_id
              AND b.verification_status IN ('auto_verified', 'manually_verified')
          )
        )
    $sql$;
  ELSE
    EXECUTE $sql$
      CREATE POLICY "Public can read verified listings"
        ON public.listings
        FOR SELECT
        TO anon, authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.businesses b
            WHERE b.owner_user_id = listings.business_id
              AND b.verification_status IN ('auto_verified', 'manually_verified')
          )
        )
    $sql$;
  END IF;
END $$;

DROP POLICY IF EXISTS "Businesses can read own listings" ON public.listings;
CREATE POLICY "Businesses can read own listings"
  ON public.listings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = business_id);

DO $$
DECLARE
  has_is_published boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'listings'
      AND c.column_name = 'is_published'
  ) INTO has_is_published;

  IF has_is_published THEN
    EXECUTE $sql$
      CREATE OR REPLACE VIEW public.public_listings_v AS
      SELECT l.*
      FROM public.listings l
      JOIN public.businesses b
        ON b.owner_user_id = l.business_id
      WHERE l.is_published = true
        AND b.verification_status IN ('auto_verified', 'manually_verified')
    $sql$;
  ELSE
    EXECUTE $sql$
      CREATE OR REPLACE VIEW public.public_listings_v AS
      SELECT l.*
      FROM public.listings l
      JOIN public.businesses b
        ON b.owner_user_id = l.business_id
      WHERE b.verification_status IN ('auto_verified', 'manually_verified')
    $sql$;
  END IF;
END $$;

GRANT SELECT ON TABLE public.public_listings_v TO anon, authenticated;

CREATE INDEX IF NOT EXISTS listings_business_id_idx
  ON public.listings (business_id);

CREATE INDEX IF NOT EXISTS businesses_verification_status_idx
  ON public.businesses (verification_status);

