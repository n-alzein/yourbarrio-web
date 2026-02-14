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

INSERT INTO public.businesses (
  owner_user_id,
  public_id,
  business_name,
  category,
  description,
  website,
  phone,
  profile_photo_url,
  cover_photo_url,
  address,
  address_2,
  city,
  state,
  postal_code,
  latitude,
  longitude,
  hours_json,
  social_links_json,
  is_internal,
  verification_status,
  stripe_connected,
  created_at,
  updated_at
)
SELECT
  u.id,
  u.public_id,
  u.business_name,
  u.category,
  u.description,
  u.website,
  u.phone,
  u.profile_photo_url,
  u.cover_photo_url,
  u.address,
  u.address_2,
  u.city,
  u.state,
  u.postal_code,
  u.latitude,
  u.longitude,
  u.hours_json,
  u.social_links_json,
  COALESCE(u.is_internal, false),
  'pending',
  false,
  COALESCE(u.created_at, now()),
  COALESCE(u.updated_at, now())
FROM public.users u
WHERE lower(COALESCE(u.role, '')) = 'business'
  AND NOT EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.owner_user_id = u.id
  )
ON CONFLICT (owner_user_id) DO NOTHING;
