WITH state_map (code, name) AS (
  VALUES
    ('AL', 'alabama'),
    ('AK', 'alaska'),
    ('AZ', 'arizona'),
    ('AR', 'arkansas'),
    ('CA', 'california'),
    ('CO', 'colorado'),
    ('CT', 'connecticut'),
    ('DE', 'delaware'),
    ('FL', 'florida'),
    ('GA', 'georgia'),
    ('HI', 'hawaii'),
    ('ID', 'idaho'),
    ('IL', 'illinois'),
    ('IN', 'indiana'),
    ('IA', 'iowa'),
    ('KS', 'kansas'),
    ('KY', 'kentucky'),
    ('LA', 'louisiana'),
    ('ME', 'maine'),
    ('MD', 'maryland'),
    ('MA', 'massachusetts'),
    ('MI', 'michigan'),
    ('MN', 'minnesota'),
    ('MS', 'mississippi'),
    ('MO', 'missouri'),
    ('MT', 'montana'),
    ('NE', 'nebraska'),
    ('NV', 'nevada'),
    ('NH', 'new hampshire'),
    ('NJ', 'new jersey'),
    ('NM', 'new mexico'),
    ('NY', 'new york'),
    ('NC', 'north carolina'),
    ('ND', 'north dakota'),
    ('OH', 'ohio'),
    ('OK', 'oklahoma'),
    ('OR', 'oregon'),
    ('PA', 'pennsylvania'),
    ('RI', 'rhode island'),
    ('SC', 'south carolina'),
    ('SD', 'south dakota'),
    ('TN', 'tennessee'),
    ('TX', 'texas'),
    ('UT', 'utah'),
    ('VT', 'vermont'),
    ('VA', 'virginia'),
    ('WA', 'washington'),
    ('WV', 'west virginia'),
    ('WI', 'wisconsin'),
    ('WY', 'wyoming')
),
normalized_users AS (
  UPDATE public.users AS u
  SET state = COALESCE(sm.code, UPPER(BTRIM(u.state)))
  FROM state_map AS sm
  WHERE u.state IS NOT NULL
    AND BTRIM(u.state) <> ''
    AND (
      LOWER(BTRIM(u.state)) = sm.name
      OR UPPER(BTRIM(u.state)) = sm.code
    )
  RETURNING 1
),
normalized_businesses AS (
  UPDATE public.businesses AS b
  SET state = COALESCE(sm.code, UPPER(BTRIM(b.state)))
  FROM state_map AS sm
  WHERE b.state IS NOT NULL
    AND BTRIM(b.state) <> ''
    AND (
      LOWER(BTRIM(b.state)) = sm.name
      OR UPPER(BTRIM(b.state)) = sm.code
    )
  RETURNING 1
)
SELECT
  (SELECT COUNT(*) FROM normalized_users) AS normalized_users_count,
  (SELECT COUNT(*) FROM normalized_businesses) AS normalized_businesses_count;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_state_format_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_state_format_check
  CHECK (state IS NULL OR state ~ '^[A-Z]{2}$') NOT VALID;

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_state_format_check;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_state_format_check
  CHECK (state IS NULL OR state ~ '^[A-Z]{2}$') NOT VALID;
