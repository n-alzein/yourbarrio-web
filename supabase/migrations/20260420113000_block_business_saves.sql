DROP POLICY IF EXISTS "User can insert saved listings" ON public.saved_listings;
DROP POLICY IF EXISTS "User can view saved listings" ON public.saved_listings;
DROP POLICY IF EXISTS "User can delete saved listings" ON public.saved_listings;

CREATE POLICY "User can view saved listings"
  ON public.saved_listings FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.id = auth.uid()
        AND COALESCE(users.role, '') <> 'business'
    )
  );

CREATE POLICY "User can insert saved listings"
  ON public.saved_listings FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.id = auth.uid()
        AND COALESCE(users.role, '') <> 'business'
    )
  );

CREATE POLICY "User can delete saved listings"
  ON public.saved_listings FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.id = auth.uid()
        AND COALESCE(users.role, '') <> 'business'
    )
  );

DROP POLICY IF EXISTS "User can view saved businesses" ON public.saved_businesses;
DROP POLICY IF EXISTS "User can insert saved businesses" ON public.saved_businesses;
DROP POLICY IF EXISTS "User can delete saved businesses" ON public.saved_businesses;

CREATE POLICY "User can view saved businesses"
  ON public.saved_businesses FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.id = auth.uid()
        AND COALESCE(users.role, '') <> 'business'
    )
  );

CREATE POLICY "User can insert saved businesses"
  ON public.saved_businesses FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.id = auth.uid()
        AND COALESCE(users.role, '') <> 'business'
    )
  );

CREATE POLICY "User can delete saved businesses"
  ON public.saved_businesses FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.id = auth.uid()
        AND COALESCE(users.role, '') <> 'business'
    )
  );
