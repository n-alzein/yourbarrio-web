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

-- Preserve business phone numbers captured by the previous shared-phone
-- onboarding behavior. This only fills businesses that have no phone, and it
-- leaves every existing business.phone value untouched.
WITH owner_phone_digits AS (
  SELECT
    b.id AS business_id,
    CASE
      WHEN length(regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g')) = 11
        AND regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g') LIKE '1%'
        THEN substring(regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g') FROM 2)
      ELSE left(regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g'), 10)
    END AS digits
  FROM public.businesses b
  JOIN public.users u ON u.id = b.owner_user_id
  WHERE NULLIF(btrim(COALESCE(b.phone, '')), '') IS NULL
    AND NULLIF(btrim(COALESCE(u.phone, '')), '') IS NOT NULL
)
UPDATE public.businesses b
SET phone = format(
    '(%s) %s-%s',
    substring(opd.digits FROM 1 FOR 3),
    substring(opd.digits FROM 4 FOR 3),
    substring(opd.digits FROM 7 FOR 4)
  )
FROM owner_phone_digits opd
WHERE b.id = opd.business_id
  AND length(opd.digits) = 10;

NOTIFY pgrst, 'reload schema';
