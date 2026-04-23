DO $$
BEGIN
  IF to_regprocedure('public.generate_short_id()') IS NULL THEN
    RAISE EXCEPTION 'Required function missing: public.generate_short_id()';
  END IF;
END$$;

DO $$
BEGIN
  LOCK TABLE public.listings IN SHARE ROW EXCLUSIVE MODE;

  UPDATE public.listings
  SET public_id = public.generate_short_id()
  WHERE public_id IS NULL OR btrim(public_id) = '';
END$$;

DO $$
DECLARE
  v_missing_count bigint;
BEGIN
  SELECT count(*)
  INTO v_missing_count
  FROM public.listings
  WHERE public_id IS NULL OR btrim(public_id) = '';

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION
      'Constraint verification failed: public.listings.public_id still NULL/blank for % rows',
      v_missing_count;
  END IF;
END$$;

DO $$
DECLARE
  v_duplicate_values bigint;
  v_duplicate_samples text;
BEGIN
  SELECT count(*)
  INTO v_duplicate_values
  FROM (
    SELECT public_id
    FROM public.listings
    GROUP BY public_id
    HAVING count(*) > 1
  ) dups;

  IF v_duplicate_values > 0 THEN
    SELECT string_agg(format('%s (x%s)', public_id, dup_count), ', ' ORDER BY dup_count DESC, public_id)
    INTO v_duplicate_samples
    FROM (
      SELECT public_id, count(*) AS dup_count
      FROM public.listings
      GROUP BY public_id
      HAVING count(*) > 1
      ORDER BY dup_count DESC, public_id
      LIMIT 10
    ) sample_dups;

    RAISE EXCEPTION
      'Constraint verification failed: public.listings.public_id has % duplicate values. Samples: %',
      v_duplicate_values,
      COALESCE(v_duplicate_samples, 'none');
  END IF;
END$$;

ALTER TABLE public.listings
  ALTER COLUMN public_id SET DEFAULT public.generate_short_id();

CREATE OR REPLACE FUNCTION public.set_listings_public_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.public_id IS NULL OR btrim(NEW.public_id) = '' THEN
    NEW.public_id := public.generate_short_id();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_listings_public_id ON public.listings;
CREATE TRIGGER trg_set_listings_public_id
BEFORE INSERT ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.set_listings_public_id();

CREATE UNIQUE INDEX IF NOT EXISTS listings_public_id_key
  ON public.listings (public_id);

ALTER TABLE public.listings
  ALTER COLUMN public_id SET NOT NULL;
