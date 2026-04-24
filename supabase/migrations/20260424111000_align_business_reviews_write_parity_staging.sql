-- Staging-first draft.
-- Align business_reviews write restrictions and update enforcement with production.
-- This draft intentionally does NOT add the production audit_write() trigger family.

CREATE OR REPLACE FUNCTION public.tg_enforce_business_reviews_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_uid uuid := auth.uid();
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if new.id <> old.id
     or new.business_id <> old.business_id
     or new.customer_id <> old.customer_id
     or new.created_at <> old.created_at
  then
    raise exception 'Review identity fields cannot be changed';
  end if;

  if v_uid = old.customer_id then
    if (new.business_reply is distinct from old.business_reply)
       or (new.business_reply_at is distinct from old.business_reply_at)
    then
      raise exception 'Customers cannot edit business reply fields';
    end if;
    return new;
  end if;

  if v_uid = old.business_id then
    if (new.rating is distinct from old.rating)
       or (new.title is distinct from old.title)
       or (new.body is distinct from old.body)
    then
      raise exception 'Businesses cannot edit customer review content';
    end if;
    return new;
  end if;

  raise exception 'Not allowed to update this review';
end;
$$;

REVOKE ALL ON FUNCTION public.tg_enforce_business_reviews_update() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_enforce_business_reviews_update ON public.business_reviews;
CREATE TRIGGER trg_enforce_business_reviews_update
BEFORE UPDATE ON public.business_reviews
FOR EACH ROW
EXECUTE FUNCTION public.tg_enforce_business_reviews_update();

DROP POLICY IF EXISTS "reviews_business_reply_update" ON public.business_reviews;
CREATE POLICY "reviews_business_reply_update"
  ON public.business_reviews
  FOR UPDATE
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = business_id)
  WITH CHECK (( SELECT auth.uid() AS uid) = business_id);

DROP POLICY IF EXISTS "reviews_customer_insert" ON public.business_reviews;
CREATE POLICY "reviews_customer_insert"
  ON public.business_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (( SELECT auth.uid() AS uid) = customer_id)
    AND (
      EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = ( SELECT auth.uid() AS uid)
          AND u.role = 'customer'
      )
    )
  );

DROP POLICY IF EXISTS "reviews_owner_delete" ON public.business_reviews;
CREATE POLICY "reviews_owner_delete"
  ON public.business_reviews
  FOR DELETE
  TO authenticated
  USING (
    (( SELECT auth.uid() AS uid) = customer_id)
    OR (
      EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = ( SELECT auth.uid() AS uid)
          AND u.role = 'admin'
      )
    )
  );

DROP POLICY IF EXISTS "reviews_owner_update" ON public.business_reviews;
CREATE POLICY "reviews_owner_update"
  ON public.business_reviews
  FOR UPDATE
  TO authenticated
  USING (
    (( SELECT auth.uid() AS uid) = customer_id)
    OR (
      EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = ( SELECT auth.uid() AS uid)
          AND u.role = 'admin'
      )
    )
  );
