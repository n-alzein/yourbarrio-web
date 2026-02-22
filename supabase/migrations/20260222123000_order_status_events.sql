CREATE TABLE IF NOT EXISTS public.order_status_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  actor_role text NOT NULL DEFAULT 'business',
  from_status text NOT NULL,
  to_status text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_status_events OWNER TO postgres;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_status_events_pkey'
  ) THEN
    ALTER TABLE public.order_status_events
      ADD CONSTRAINT order_status_events_pkey PRIMARY KEY (id);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_status_events_order_id_fkey'
  ) THEN
    ALTER TABLE public.order_status_events
      ADD CONSTRAINT order_status_events_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
  ELSIF EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'order_status_events_order_id_fkey'
      AND c.confdeltype <> 'c'
  ) THEN
    ALTER TABLE public.order_status_events
      DROP CONSTRAINT order_status_events_order_id_fkey;
    ALTER TABLE public.order_status_events
      ADD CONSTRAINT order_status_events_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_status_events_vendor_id_fkey'
  ) THEN
    ALTER TABLE public.order_status_events
      ADD CONSTRAINT order_status_events_vendor_id_fkey
      FOREIGN KEY (vendor_id) REFERENCES public.users(id) ON DELETE RESTRICT;
  ELSIF EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'order_status_events_vendor_id_fkey'
      AND c.confdeltype <> 'r'
  ) THEN
    ALTER TABLE public.order_status_events
      DROP CONSTRAINT order_status_events_vendor_id_fkey;
    ALTER TABLE public.order_status_events
      ADD CONSTRAINT order_status_events_vendor_id_fkey
      FOREIGN KEY (vendor_id) REFERENCES public.users(id) ON DELETE RESTRICT;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_status_events_actor_user_id_fkey'
  ) THEN
    ALTER TABLE public.order_status_events
      ADD CONSTRAINT order_status_events_actor_user_id_fkey
      FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
  ELSIF EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'order_status_events_actor_user_id_fkey'
      AND c.confdeltype <> 'r'
  ) THEN
    ALTER TABLE public.order_status_events
      DROP CONSTRAINT order_status_events_actor_user_id_fkey;
    ALTER TABLE public.order_status_events
      ADD CONSTRAINT order_status_events_actor_user_id_fkey
      FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS order_status_events_order_created_idx
  ON public.order_status_events (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_status_events_vendor_created_idx
  ON public.order_status_events (vendor_id, created_at DESC);

ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_status_events'
      AND policyname = 'Business owners can read own order status events'
  ) THEN
    DROP POLICY "Business owners can read own order status events"
      ON public.order_status_events;
  END IF;
END$$;

CREATE POLICY "Business owners can read own order status events"
  ON public.order_status_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.vendor_members vm
      WHERE vm.vendor_id = order_status_events.vendor_id
        AND vm.user_id = auth.uid()
        AND vm.role IN ('owner', 'manager')
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_status_events'
      AND policyname = 'Business owners can insert own order status events'
  ) THEN
    DROP POLICY "Business owners can insert own order status events"
      ON public.order_status_events;
  END IF;
END$$;

CREATE POLICY "Business owners can insert own order status events"
  ON public.order_status_events FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.vendor_members vm
      WHERE vm.vendor_id = order_status_events.vendor_id
        AND vm.user_id = auth.uid()
        AND vm.role IN ('owner', 'manager')
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_status_events'
      AND policyname = 'Admins can read all order status events'
  ) THEN
    CREATE POLICY "Admins can read all order status events"
      ON public.order_status_events FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.users u
          WHERE u.id = auth.uid()
            AND u.role IN ('admin_readonly', 'admin_support', 'admin_ops', 'admin_super')
        )
      );
  END IF;
END$$;
