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

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS admin_hidden boolean NOT NULL DEFAULT false;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.listings.admin_hidden IS
  'Admin-only moderation flag. When true, the listing is excluded from all public marketplace surfaces.';

COMMENT ON COLUMN public.listings.is_test IS
  'Admin-only test/internal flag. Test listings are excluded from all public marketplace surfaces.';

CREATE INDEX IF NOT EXISTS listings_business_admin_visibility_idx
  ON public.listings (business_id, admin_hidden, created_at DESC);

DO $$
DECLARE
  has_status boolean;
  has_is_published boolean;
  current_view_has_is_test boolean;
  select_is_test_column text;
  where_status text;
  where_is_published text;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'listings'
      AND column_name = 'status'
  )
  INTO has_status;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'listings'
      AND column_name = 'is_published'
  )
  INTO has_is_published;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'public_listings_v'
      AND column_name = 'is_test'
  )
  INTO current_view_has_is_test;

  select_is_test_column := CASE
    WHEN current_view_has_is_test THEN 'l.is_test,'
    ELSE ''
  END;

  where_status := CASE
    WHEN has_status THEN ' AND l.status = ''published'''
    ELSE ''
  END;

  where_is_published := CASE
    WHEN has_is_published THEN ' AND l.is_published = true'
    ELSE ''
  END;

  EXECUTE format(
    $sql$
      CREATE OR REPLACE VIEW public.public_listings_v AS
      SELECT
        l.id,
        l.business_id,
        l.title,
        l.description,
        l.price,
        l.category,
        l.city,
        l.photo_url,
        l.created_at,
        %s
        l.inventory_quantity,
        l.inventory_status,
        l.low_stock_threshold,
        l.inventory_last_updated_at,
        l.category_id,
        l.public_id,
        l.listing_category,
        l.listing_subcategory,
        l.pickup_enabled,
        l.local_delivery_enabled,
        l.delivery_fee_cents,
        l.use_business_delivery_defaults,
        l.photo_variants,
        l.is_internal,
        l.cover_image_id,
        l.is_seeded,
        b.is_seeded AS business_is_seeded
      FROM public.listings l
      JOIN public.businesses b
        ON b.owner_user_id = l.business_id
      WHERE 1=1
        %s
        %s
        AND COALESCE(l.admin_hidden, false) = false
        AND COALESCE(l.is_internal, false) = false
        AND COALESCE(l.is_test, false) = false
        AND COALESCE(b.is_internal, false) = false
        AND b.verification_status IN ('auto_verified', 'manually_verified')
    $sql$,
    select_is_test_column,
    where_status,
    where_is_published
  );
END $$;

ALTER VIEW public.public_listings_v SET (security_invoker = true);

GRANT SELECT ON TABLE public.public_listings_v TO anon, authenticated;

COMMENT ON VIEW public.public_listings_v IS
  'Public listing surface using centralized visibility rules, excluding admin-hidden and internal/test listings.';
