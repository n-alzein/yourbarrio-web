SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS business_type text;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS business_type text;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS listing_category text,
  ADD COLUMN IF NOT EXISTS listing_subcategory text;

UPDATE public.businesses
SET business_type = CASE
  WHEN lower(trim(category)) IN ('clothing & accessories', 'shoes') THEN 'boutique'
  WHEN lower(trim(category)) = 'furniture' THEN 'furniture-decor'
  WHEN lower(trim(category)) IN ('home & kitchen', 'bedding & bath', 'smart home') THEN 'home-goods'
  WHEN lower(trim(category)) IN ('health & beauty') THEN 'beauty-wellness'
  WHEN lower(trim(category)) IN ('fitness & wellness', 'sports & outdoors', 'sports & recreation') THEN 'fitness'
  WHEN lower(trim(category)) IN ('food & drink') THEN 'food-drink'
  WHEN lower(trim(category)) IN ('grocery & gourmet') THEN 'grocery-specialty-foods'
  WHEN lower(trim(category)) IN ('garden & outdoor') THEN 'florist-plants'
  WHEN lower(trim(category)) IN ('pets & animals') THEN 'pet-shop'
  WHEN lower(trim(category)) IN ('books & media') THEN 'bookstore'
  WHEN lower(trim(category)) IN ('jewelry & watches') THEN 'jewelry'
  WHEN lower(trim(category)) IN ('kids & family', 'baby & maternity') THEN 'kids-family'
  WHEN lower(trim(category)) IN ('tech & electronics', 'computers & accessories', 'mobile & accessories', 'video games') THEN 'tech-shop'
  WHEN lower(trim(category)) IN ('automotive') THEN 'automotive'
  WHEN lower(trim(category)) IN ('arts & crafts', 'arts & entertainment', 'music & instruments', 'photography') THEN 'arts-crafts'
  WHEN lower(trim(category)) IN ('handmade & artisan') THEN 'handmade-artisan'
  WHEN lower(trim(category)) IN ('professional services') THEN 'professional-services'
  WHEN lower(trim(category)) IN ('home services', 'tools & home improvement') THEN 'home-services'
  WHEN lower(trim(category)) IN ('travel & hospitality', 'travel & luggage') THEN 'travel-hospitality'
  WHEN category IS NOT NULL AND trim(category) <> '' THEN 'specialty-retail'
  ELSE business_type
END
WHERE business_type IS NULL OR trim(business_type) = '';

UPDATE public.users u
SET business_type = b.business_type
FROM public.businesses b
WHERE b.owner_user_id = u.id
  AND (u.business_type IS NULL OR trim(u.business_type) = '');

UPDATE public.listings
SET listing_category = COALESCE(NULLIF(trim(listing_category), ''), NULLIF(trim(category), ''))
WHERE listing_category IS NULL OR trim(listing_category) = '';

CREATE INDEX IF NOT EXISTS businesses_business_type_idx
  ON public.businesses (business_type);

CREATE INDEX IF NOT EXISTS users_business_type_idx
  ON public.users (business_type);

CREATE INDEX IF NOT EXISTS listings_listing_category_idx
  ON public.listings (listing_category);
