BEGIN;

-- Verifies that only a visible, published, non-internal, non-test listing from a
-- verified non-internal business appears in public.public_listings_v after the
-- admin_hidden moderation migration is applied.

CREATE TEMP TABLE admin_listing_moderation_verification_result (
  result text NOT NULL,
  run_suffix text NOT NULL,
  visible_count integer NOT NULL,
  leaked_count integer NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  visible_business_owner_id uuid;
  internal_business_owner_id uuid;
  unverified_business_owner_id uuid;
  run_suffix text := substring(replace(gen_random_uuid()::text, '-', '') from 1 for 12);
  visible_public_id text;
  admin_hidden_public_id text;
  internal_public_id text;
  test_public_id text;
  internal_business_public_id text;
  unverified_business_public_id text;
  visible_count integer;
  leaked_count integer;
  has_status boolean;
  has_is_published boolean;
  has_admin_hidden boolean;
  has_is_internal boolean;
  has_is_test boolean;
  has_public_id boolean;
  has_updated_at boolean;
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
      AND column_name = 'admin_hidden'
  )
  INTO has_admin_hidden;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'listings'
      AND column_name = 'is_internal'
  )
  INTO has_is_internal;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'listings'
      AND column_name = 'is_test'
  )
  INTO has_is_test;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'listings'
      AND column_name = 'public_id'
  )
  INTO has_public_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'listings'
      AND column_name = 'updated_at'
  )
  INTO has_updated_at;

  IF NOT has_status THEN
    RAISE EXCEPTION 'Verification requires public.listings.status to exist.';
  END IF;

  IF NOT has_admin_hidden THEN
    RAISE EXCEPTION 'Verification requires public.listings.admin_hidden to exist.';
  END IF;

  IF NOT has_is_internal THEN
    RAISE EXCEPTION 'Verification requires public.listings.is_internal to exist.';
  END IF;

  IF NOT has_is_test THEN
    RAISE EXCEPTION 'Verification requires public.listings.is_test to exist.';
  END IF;

  IF NOT has_public_id THEN
    RAISE EXCEPTION 'Verification requires public.listings.public_id to exist.';
  END IF;

  visible_public_id := format('modcheck-visible-%s', run_suffix);
  admin_hidden_public_id := format('modcheck-admin-hidden-%s', run_suffix);
  internal_public_id := format('modcheck-internal-%s', run_suffix);
  test_public_id := format('modcheck-test-%s', run_suffix);
  internal_business_public_id := format('modcheck-internal-business-%s', run_suffix);
  unverified_business_public_id := format('modcheck-unverified-business-%s', run_suffix);

  SELECT b.owner_user_id
  INTO visible_business_owner_id
  FROM public.businesses b
  WHERE COALESCE(b.is_internal, false) = false
    AND b.verification_status IN ('auto_verified', 'manually_verified')
  ORDER BY b.updated_at DESC NULLS LAST, b.created_at DESC NULLS LAST
  LIMIT 1;

  SELECT b.owner_user_id
  INTO internal_business_owner_id
  FROM public.businesses b
  WHERE COALESCE(b.is_internal, false) = true
    AND b.verification_status IN ('auto_verified', 'manually_verified')
  ORDER BY b.updated_at DESC NULLS LAST, b.created_at DESC NULLS LAST
  LIMIT 1;

  SELECT b.owner_user_id
  INTO unverified_business_owner_id
  FROM public.businesses b
  WHERE COALESCE(b.is_internal, false) = false
    AND b.verification_status NOT IN ('auto_verified', 'manually_verified')
  ORDER BY b.updated_at DESC NULLS LAST, b.created_at DESC NULLS LAST
  LIMIT 1;

  IF visible_business_owner_id IS NULL THEN
    RAISE EXCEPTION 'Verification fixture missing: no verified non-internal business found.';
  END IF;

  IF internal_business_owner_id IS NULL THEN
    RAISE EXCEPTION 'Verification fixture missing: no verified internal business found.';
  END IF;

  IF unverified_business_owner_id IS NULL THEN
    RAISE EXCEPTION 'Verification fixture missing: no unverified non-internal business found.';
  END IF;

  IF has_updated_at AND has_is_published THEN
    EXECUTE $sql$
      INSERT INTO public.listings (
        id,
        business_id,
        public_id,
        title,
        description,
        price,
        category,
        city,
        status,
        is_published,
        admin_hidden,
        is_internal,
        is_test,
        created_at,
        updated_at
      )
      VALUES
        (gen_random_uuid(), $1, $2, 'Moderation check visible listing', 'Expected to remain visible in public_listings_v.', 10, 'Verification', 'Long Beach', 'published', true, false, false, false, now(), now()),
        (gen_random_uuid(), $1, $3, 'Moderation check admin hidden listing', 'Expected to be excluded by admin_hidden.', 11, 'Verification', 'Long Beach', 'published', true, true, false, false, now(), now()),
        (gen_random_uuid(), $1, $4, 'Moderation check internal listing', 'Expected to be excluded by is_internal.', 12, 'Verification', 'Long Beach', 'published', true, false, true, false, now(), now()),
        (gen_random_uuid(), $1, $5, 'Moderation check test listing', 'Expected to be excluded by is_test.', 13, 'Verification', 'Long Beach', 'published', true, false, false, true, now(), now()),
        (gen_random_uuid(), $6, $7, 'Moderation check internal business listing', 'Expected to be excluded by internal business visibility.', 14, 'Verification', 'Long Beach', 'published', true, false, false, false, now(), now()),
        (gen_random_uuid(), $8, $9, 'Moderation check unverified business listing', 'Expected to be excluded by business verification status.', 15, 'Verification', 'Long Beach', 'published', true, false, false, false, now(), now())
    $sql$
    USING
      visible_business_owner_id,
      visible_public_id,
      admin_hidden_public_id,
      internal_public_id,
      test_public_id,
      internal_business_owner_id,
      internal_business_public_id,
      unverified_business_owner_id,
      unverified_business_public_id;
  ELSIF has_updated_at THEN
    EXECUTE $sql$
      INSERT INTO public.listings (
        id,
        business_id,
        public_id,
        title,
        description,
        price,
        category,
        city,
        status,
        admin_hidden,
        is_internal,
        is_test,
        created_at,
        updated_at
      )
      VALUES
        (gen_random_uuid(), $1, $2, 'Moderation check visible listing', 'Expected to remain visible in public_listings_v.', 10, 'Verification', 'Long Beach', 'published', false, false, false, now(), now()),
        (gen_random_uuid(), $1, $3, 'Moderation check admin hidden listing', 'Expected to be excluded by admin_hidden.', 11, 'Verification', 'Long Beach', 'published', true, false, false, now(), now()),
        (gen_random_uuid(), $1, $4, 'Moderation check internal listing', 'Expected to be excluded by is_internal.', 12, 'Verification', 'Long Beach', 'published', false, true, false, now(), now()),
        (gen_random_uuid(), $1, $5, 'Moderation check test listing', 'Expected to be excluded by is_test.', 13, 'Verification', 'Long Beach', 'published', false, false, true, now(), now()),
        (gen_random_uuid(), $6, $7, 'Moderation check internal business listing', 'Expected to be excluded by internal business visibility.', 14, 'Verification', 'Long Beach', 'published', false, false, false, now(), now()),
        (gen_random_uuid(), $8, $9, 'Moderation check unverified business listing', 'Expected to be excluded by business verification status.', 15, 'Verification', 'Long Beach', 'published', false, false, false, now(), now())
    $sql$
    USING
      visible_business_owner_id,
      visible_public_id,
      admin_hidden_public_id,
      internal_public_id,
      test_public_id,
      internal_business_owner_id,
      internal_business_public_id,
      unverified_business_owner_id,
      unverified_business_public_id;
  ELSIF has_is_published THEN
    EXECUTE $sql$
      INSERT INTO public.listings (
        id,
        business_id,
        public_id,
        title,
        description,
        price,
        category,
        city,
        status,
        is_published,
        admin_hidden,
        is_internal,
        is_test,
        created_at
      )
      VALUES
        (gen_random_uuid(), $1, $2, 'Moderation check visible listing', 'Expected to remain visible in public_listings_v.', 10, 'Verification', 'Long Beach', 'published', true, false, false, false, now()),
        (gen_random_uuid(), $1, $3, 'Moderation check admin hidden listing', 'Expected to be excluded by admin_hidden.', 11, 'Verification', 'Long Beach', 'published', true, true, false, false, now()),
        (gen_random_uuid(), $1, $4, 'Moderation check internal listing', 'Expected to be excluded by is_internal.', 12, 'Verification', 'Long Beach', 'published', true, false, true, false, now()),
        (gen_random_uuid(), $1, $5, 'Moderation check test listing', 'Expected to be excluded by is_test.', 13, 'Verification', 'Long Beach', 'published', true, false, false, true, now()),
        (gen_random_uuid(), $6, $7, 'Moderation check internal business listing', 'Expected to be excluded by internal business visibility.', 14, 'Verification', 'Long Beach', 'published', true, false, false, false, now()),
        (gen_random_uuid(), $8, $9, 'Moderation check unverified business listing', 'Expected to be excluded by business verification status.', 15, 'Verification', 'Long Beach', 'published', true, false, false, false, now())
    $sql$
    USING
      visible_business_owner_id,
      visible_public_id,
      admin_hidden_public_id,
      internal_public_id,
      test_public_id,
      internal_business_owner_id,
      internal_business_public_id,
      unverified_business_owner_id,
      unverified_business_public_id;
  ELSE
    EXECUTE $sql$
      INSERT INTO public.listings (
        id,
        business_id,
        public_id,
        title,
        description,
        price,
        category,
        city,
        status,
        admin_hidden,
        is_internal,
        is_test,
        created_at
      )
      VALUES
        (gen_random_uuid(), $1, $2, 'Moderation check visible listing', 'Expected to remain visible in public_listings_v.', 10, 'Verification', 'Long Beach', 'published', false, false, false, now()),
        (gen_random_uuid(), $1, $3, 'Moderation check admin hidden listing', 'Expected to be excluded by admin_hidden.', 11, 'Verification', 'Long Beach', 'published', true, false, false, now()),
        (gen_random_uuid(), $1, $4, 'Moderation check internal listing', 'Expected to be excluded by is_internal.', 12, 'Verification', 'Long Beach', 'published', false, true, false, now()),
        (gen_random_uuid(), $1, $5, 'Moderation check test listing', 'Expected to be excluded by is_test.', 13, 'Verification', 'Long Beach', 'published', false, false, true, now()),
        (gen_random_uuid(), $6, $7, 'Moderation check internal business listing', 'Expected to be excluded by internal business visibility.', 14, 'Verification', 'Long Beach', 'published', false, false, false, now()),
        (gen_random_uuid(), $8, $9, 'Moderation check unverified business listing', 'Expected to be excluded by business verification status.', 15, 'Verification', 'Long Beach', 'published', false, false, false, now())
    $sql$
    USING
      visible_business_owner_id,
      visible_public_id,
      admin_hidden_public_id,
      internal_public_id,
      test_public_id,
      internal_business_owner_id,
      internal_business_public_id,
      unverified_business_owner_id,
      unverified_business_public_id;
  END IF;

  SELECT COUNT(*)
  INTO visible_count
  FROM public.public_listings_v
  WHERE public_id = visible_public_id;

  SELECT COUNT(*)
  INTO leaked_count
  FROM public.public_listings_v
  WHERE public_id IN (
    admin_hidden_public_id,
    internal_public_id,
    test_public_id,
    internal_business_public_id,
    unverified_business_public_id
  );

  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one visible moderation fixture in public_listings_v, found %.', visible_count;
  END IF;

  IF leaked_count <> 0 THEN
    RAISE EXCEPTION 'Expected zero hidden/internal/test moderation fixtures in public_listings_v, found %.', leaked_count;
  END IF;

  INSERT INTO admin_listing_moderation_verification_result (
    result,
    run_suffix,
    visible_count,
    leaked_count
  )
  VALUES ('PASS', run_suffix, visible_count, leaked_count);
END $$;

SELECT result, run_suffix, visible_count, leaked_count
FROM admin_listing_moderation_verification_result;

ROLLBACK;
