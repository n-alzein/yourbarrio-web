-- Cleanly separate business discovery taxonomy from listing/category taxonomy.
-- Legacy fields are intentionally retained during the compatibility period.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.business_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NULL,
  icon text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.listing_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  parent_id uuid NULL REFERENCES public.listing_categories(id),
  description text NULL,
  icon text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF to_regprocedure('public.set_row_updated_at()') IS NULL THEN
    CREATE FUNCTION public.set_row_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $set_row_updated_at$
    BEGIN
      NEW.updated_at := now();
      RETURN NEW;
    END;
    $set_row_updated_at$;
  END IF;
END$$;

DROP TRIGGER IF EXISTS business_types_set_updated_at ON public.business_types;
CREATE TRIGGER business_types_set_updated_at
BEFORE UPDATE ON public.business_types
FOR EACH ROW
EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS listing_categories_set_updated_at ON public.listing_categories;
CREATE TRIGGER listing_categories_set_updated_at
BEFORE UPDATE ON public.listing_categories
FOR EACH ROW
EXECUTE FUNCTION public.set_row_updated_at();

ALTER TABLE public.business_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_categories ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'business_types'
      AND policyname = 'Public read business types'
  ) THEN
    CREATE POLICY "Public read business types"
      ON public.business_types FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'listing_categories'
      AND policyname = 'Public read listing categories'
  ) THEN
    CREATE POLICY "Public read listing categories"
      ON public.listing_categories FOR SELECT
      USING (true);
  END IF;
END$$;

INSERT INTO public.business_types (slug, name, sort_order, is_active)
VALUES
  ('boutique', 'Boutique', 10, true),
  ('thrift-vintage', 'Thrift & Vintage', 20, true),
  ('gift-shop', 'Gift Shop', 30, true),
  ('home-goods', 'Home Goods', 40, true),
  ('furniture-decor', 'Furniture & Decor', 50, true),
  ('beauty-wellness', 'Beauty & Wellness', 60, true),
  ('food-drink', 'Food & Drink', 70, true),
  ('grocery-specialty-foods', 'Grocery & Specialty Foods', 80, true),
  ('florist-plants', 'Florist & Plants', 90, true),
  ('pet-shop', 'Pet Shop', 100, true),
  ('bookstore', 'Bookstore', 110, true),
  ('jewelry', 'Jewelry', 120, true),
  ('kids-family', 'Kids & Family', 130, true),
  ('tech-shop', 'Tech Shop', 140, true),
  ('automotive', 'Automotive', 150, true),
  ('fitness', 'Fitness', 160, true),
  ('arts-crafts', 'Arts & Crafts', 170, true),
  ('handmade-artisan', 'Handmade & Artisan', 180, true),
  ('professional-services', 'Professional Services', 190, true),
  ('home-services', 'Home Services', 200, true),
  ('travel-hospitality', 'Travel & Hospitality', 210, true),
  ('specialty-retail', 'Specialty Retail', 220, true),
  ('other', 'Other', 230, true)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = now();

INSERT INTO public.listing_categories (slug, name, sort_order, is_active)
VALUES
  ('clothing-fashion', 'Clothing & Fashion', 10, true),
  ('beauty-personal-care', 'Beauty & Personal Care', 20, true),
  ('home-decor', 'Home & Decor', 30, true),
  ('jewelry-accessories', 'Jewelry & Accessories', 40, true),
  ('books-stationery', 'Books & Stationery', 50, true),
  ('electronics-tech', 'Electronics & Tech', 60, true),
  ('flowers-plants', 'Flowers & Plants', 70, true),
  ('art-handmade', 'Art & Handmade', 80, true),
  ('home-goods-appliances', 'Home Goods & Appliances', 90, true),
  ('toys-games', 'Toys & Games', 100, true),
  ('sports-outdoors', 'Sports & Outdoors', 110, true),
  ('other', 'Other', 120, true)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = now();

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS business_type_id uuid;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS listing_category_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'businesses_business_type_id_fkey'
  ) THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_business_type_id_fkey
      FOREIGN KEY (business_type_id) REFERENCES public.business_types(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'listings_listing_category_id_fkey'
  ) THEN
    ALTER TABLE public.listings
      ADD CONSTRAINT listings_listing_category_id_fkey
      FOREIGN KEY (listing_category_id) REFERENCES public.listing_categories(id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS businesses_business_type_id_idx
  ON public.businesses (business_type_id);

CREATE INDEX IF NOT EXISTS listings_listing_category_id_idx
  ON public.listings (listing_category_id);

WITH normalized AS (
  SELECT
    b.id,
    CASE
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('boutique') THEN 'boutique'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('thrift-vintage') THEN 'thrift-vintage'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('gift-shop') THEN 'gift-shop'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('home-goods') THEN 'home-goods'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('furniture-decor') THEN 'furniture-decor'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('beauty-wellness') THEN 'beauty-wellness'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('food-drink') THEN 'food-drink'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('grocery-specialty-foods') THEN 'grocery-specialty-foods'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('florist-plants') THEN 'florist-plants'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('pet-shop') THEN 'pet-shop'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('bookstore') THEN 'bookstore'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('jewelry') THEN 'jewelry'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('kids-family') THEN 'kids-family'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('tech-shop') THEN 'tech-shop'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('automotive') THEN 'automotive'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('fitness') THEN 'fitness'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('arts-crafts') THEN 'arts-crafts'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('handmade-artisan') THEN 'handmade-artisan'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('professional-services') THEN 'professional-services'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('home-services') THEN 'home-services'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('travel-hospitality') THEN 'travel-hospitality'
      WHEN lower(trim(coalesce(b.business_type, ''))) IN ('specialty-retail') THEN 'specialty-retail'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('clothing & accessories', 'shoes', 'boutique') THEN 'boutique'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('thrift & vintage') THEN 'thrift-vintage'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('gift shop', 'toys & games') THEN 'gift-shop'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('home goods', 'home & kitchen', 'bedding & bath', 'smart home') THEN 'home-goods'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('furniture', 'furniture & decor') THEN 'furniture-decor'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('beauty & wellness', 'health & beauty') THEN 'beauty-wellness'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('food & drink') THEN 'food-drink'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('grocery & specialty foods', 'grocery & gourmet') THEN 'grocery-specialty-foods'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('florist & plants', 'garden & outdoor') THEN 'florist-plants'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('pet shop', 'pets & animals') THEN 'pet-shop'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('bookstore', 'books & media') THEN 'bookstore'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('jewelry', 'jewelry & watches') THEN 'jewelry'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('kids & family', 'baby & maternity') THEN 'kids-family'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('tech shop', 'tech & electronics', 'computers & accessories', 'mobile & accessories', 'video games') THEN 'tech-shop'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('automotive') THEN 'automotive'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('fitness', 'fitness & wellness', 'sports & outdoors', 'sports & recreation') THEN 'fitness'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('arts & crafts', 'arts & entertainment', 'music & instruments', 'photography') THEN 'arts-crafts'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('handmade & artisan') THEN 'handmade-artisan'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('professional services') THEN 'professional-services'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('home services', 'tools & home improvement') THEN 'home-services'
      WHEN lower(trim(coalesce(b.category, ''))) IN ('travel & hospitality', 'travel & luggage') THEN 'travel-hospitality'
      ELSE 'other'
    END AS slug
  FROM public.businesses b
)
UPDATE public.businesses b
SET business_type_id = bt.id,
    business_type = bt.slug,
    category = bt.name
FROM normalized n
JOIN public.business_types bt ON bt.slug = n.slug
WHERE b.id = n.id
  AND (
    b.business_type_id IS DISTINCT FROM bt.id
    OR b.business_type IS DISTINCT FROM bt.slug
    OR b.category IS DISTINCT FROM bt.name
  );

WITH raw_values AS (
  SELECT
    l.id,
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(coalesce(nullif(trim(l.category), ''), nullif(trim(l.listing_category), ''), '')),
          '&',
          'and',
          'g'
        ),
        '[^a-z0-9]+',
        '-',
        'g'
      ),
      '(^-+)|(-+$)',
      '',
      'g'
    ) AS token
  FROM public.listings l
),
normalized AS (
  SELECT
    id,
    CASE
      WHEN token IN ('clothing-fashion', 'clothing-and-fashion', 'clothing', 'clothing-and-accessories', 'shoes') THEN 'clothing-fashion'
      WHEN token IN ('beauty-personal-care', 'beauty-and-personal-care', 'beauty', 'health-and-beauty') THEN 'beauty-personal-care'
      WHEN token IN ('home-decor', 'home-and-decor', 'home-and-kitchen', 'furniture', 'bedding-and-bath') THEN 'home-decor'
      WHEN token IN ('jewelry-accessories', 'jewelry-and-accessories', 'jewelry-and-watches', 'accessory', 'accessories') THEN 'jewelry-accessories'
      WHEN token IN ('books-stationery', 'books-and-stationery', 'books', 'books-and-media', 'office-and-school') THEN 'books-stationery'
      WHEN token IN ('electronics-tech', 'electronics', 'computers-and-accessories', 'mobile-and-accessories', 'smart-home', 'tech-and-electronics', 'video-games') THEN 'electronics-tech'
      WHEN token IN ('flowers-plants', 'flowers-and-plants', 'flowers', 'garden-and-outdoor') THEN 'flowers-plants'
      WHEN token IN ('art-handmade', 'art-and-handmade', 'arts-and-crafts', 'handmade-and-artisan', 'arts-and-entertainment', 'photography', 'music-and-instruments') THEN 'art-handmade'
      WHEN token IN ('home-goods-appliances', 'home-goods-and-appliances', 'tools-and-home-improvement') THEN 'home-goods-appliances'
      WHEN token IN ('toys-games', 'toys-and-games') THEN 'toys-games'
      WHEN token IN ('sports-outdoors', 'sports-and-outdoors', 'sports-and-recreation', 'fitness-and-wellness') THEN 'sports-outdoors'
      ELSE 'other'
    END AS slug
  FROM raw_values
)
UPDATE public.listings l
SET listing_category_id = lc.id,
    category = lc.slug,
    listing_category = lc.name
FROM normalized n
JOIN public.listing_categories lc ON lc.slug = n.slug
WHERE l.id = n.id
  AND (
    l.listing_category_id IS DISTINCT FROM lc.id
    OR l.category IS DISTINCT FROM lc.slug
    OR l.listing_category IS DISTINCT FROM lc.name
  );

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
        b.is_seeded AS business_is_seeded,
        l.listing_category_id
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

CREATE OR REPLACE FUNCTION public.sync_business_type_fields()
RETURNS trigger AS $$
DECLARE
  resolved public.business_types%ROWTYPE;
BEGIN
  IF NEW.business_type_id IS NOT NULL THEN
    SELECT * INTO resolved
    FROM public.business_types
    WHERE id = NEW.business_type_id;
  ELSE
    SELECT * INTO resolved
    FROM public.business_types
    WHERE slug = NULLIF(trim(COALESCE(NEW.business_type, '')), '')
       OR lower(name) = lower(NULLIF(trim(COALESCE(NEW.category, '')), ''))
    ORDER BY CASE WHEN slug = NULLIF(trim(COALESCE(NEW.business_type, '')), '') THEN 0 ELSE 1 END
    LIMIT 1;
  END IF;

  IF resolved.id IS NULL THEN
    SELECT * INTO resolved
    FROM public.business_types
    WHERE slug = 'other';
  END IF;

  IF resolved.id IS NOT NULL THEN
    NEW.business_type_id := resolved.id;
    NEW.business_type := resolved.slug;
    NEW.category := resolved.name;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS businesses_sync_business_type_fields ON public.businesses;
CREATE TRIGGER businesses_sync_business_type_fields
BEFORE INSERT OR UPDATE OF business_type_id, business_type, category ON public.businesses
FOR EACH ROW
EXECUTE FUNCTION public.sync_business_type_fields();

CREATE OR REPLACE FUNCTION public.sync_listing_category_fields_v2()
RETURNS trigger AS $$
DECLARE
  resolved public.listing_categories%ROWTYPE;
BEGIN
  IF NEW.listing_category_id IS NOT NULL THEN
    SELECT * INTO resolved
    FROM public.listing_categories
    WHERE id = NEW.listing_category_id;
  ELSE
    SELECT * INTO resolved
    FROM public.listing_categories
    WHERE slug = NULLIF(trim(COALESCE(NEW.category, '')), '')
       OR lower(name) = lower(NULLIF(trim(COALESCE(NEW.listing_category, '')), ''))
    ORDER BY CASE WHEN slug = NULLIF(trim(COALESCE(NEW.category, '')), '') THEN 0 ELSE 1 END
    LIMIT 1;
  END IF;

  IF resolved.id IS NULL THEN
    SELECT * INTO resolved
    FROM public.listing_categories
    WHERE slug = 'other';
  END IF;

  IF resolved.id IS NOT NULL THEN
    NEW.listing_category_id := resolved.id;
    NEW.category := resolved.slug;
    NEW.listing_category := resolved.name;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS listings_sync_listing_category_fields_v2 ON public.listings;
CREATE TRIGGER listings_sync_listing_category_fields_v2
BEFORE INSERT OR UPDATE OF listing_category_id, category, listing_category ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.sync_listing_category_fields_v2();
