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
  ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.listings.is_seeded IS
  'Seeded launch/demo listing content for discovery previews only. Seeded listings are not purchasable.';

COMMENT ON COLUMN public.businesses.is_seeded IS
  'Seeded launch/demo business content for discovery previews only. Seeded listings and businesses are not purchasable.';

DO $$
DECLARE
  has_status boolean;
  has_is_published boolean;
  has_is_test boolean;
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
      AND table_name = 'listings'
      AND column_name = 'is_test'
  )
  INTO has_is_test;

  IF has_status AND has_is_published AND has_is_test THEN
    EXECUTE $sql$
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
        l.is_test,
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
      WHERE l.status = 'published'
        AND l.is_published = true
        AND b.verification_status IN ('auto_verified', 'manually_verified')
        AND (
          (
            COALESCE(l.is_internal, false) = false
            AND COALESCE(b.is_internal, false) = false
          )
          OR public.viewer_can_see_internal_content()
        )
    $sql$;
  ELSIF has_status AND has_is_published THEN
    EXECUTE $sql$
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
      WHERE l.status = 'published'
        AND l.is_published = true
        AND b.verification_status IN ('auto_verified', 'manually_verified')
        AND (
          (
            COALESCE(l.is_internal, false) = false
            AND COALESCE(b.is_internal, false) = false
          )
          OR public.viewer_can_see_internal_content()
        )
    $sql$;
  ELSIF has_status AND has_is_test THEN
    EXECUTE $sql$
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
        l.is_test,
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
      WHERE l.status = 'published'
        AND b.verification_status IN ('auto_verified', 'manually_verified')
        AND (
          (
            COALESCE(l.is_internal, false) = false
            AND COALESCE(b.is_internal, false) = false
          )
          OR public.viewer_can_see_internal_content()
        )
    $sql$;
  ELSIF has_status THEN
    EXECUTE $sql$
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
      WHERE l.status = 'published'
        AND b.verification_status IN ('auto_verified', 'manually_verified')
        AND (
          (
            COALESCE(l.is_internal, false) = false
            AND COALESCE(b.is_internal, false) = false
          )
          OR public.viewer_can_see_internal_content()
        )
    $sql$;
  ELSIF has_is_published AND has_is_test THEN
    EXECUTE $sql$
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
        l.is_test,
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
      WHERE l.is_published = true
        AND b.verification_status IN ('auto_verified', 'manually_verified')
        AND (
          (
            COALESCE(l.is_internal, false) = false
            AND COALESCE(b.is_internal, false) = false
          )
          OR public.viewer_can_see_internal_content()
        )
    $sql$;
  ELSIF has_is_published THEN
    EXECUTE $sql$
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
      WHERE l.is_published = true
        AND b.verification_status IN ('auto_verified', 'manually_verified')
        AND (
          (
            COALESCE(l.is_internal, false) = false
            AND COALESCE(b.is_internal, false) = false
          )
          OR public.viewer_can_see_internal_content()
        )
    $sql$;
  ELSE
    EXECUTE $sql$
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
      WHERE b.verification_status IN ('auto_verified', 'manually_verified')
        AND (
          (
            COALESCE(l.is_internal, false) = false
            AND COALESCE(b.is_internal, false) = false
          )
          OR public.viewer_can_see_internal_content()
        )
    $sql$;
  END IF;
END
$$;

ALTER VIEW public.public_listings_v SET (security_invoker = true);

GRANT SELECT ON TABLE public.public_listings_v TO anon, authenticated;

COMMENT ON VIEW public.public_listings_v IS
  'Public listing surface using invoker semantics. Includes seeded preview flags so demo discovery content can render without being treated as purchasable inventory.';

NOTIFY pgrst, 'reload schema';
