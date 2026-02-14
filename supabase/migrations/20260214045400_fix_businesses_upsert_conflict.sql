-- 1) Drop the partial unique indexes (safe if names match; adjust if yours differ)
drop index if exists public.businesses_owner_user_id_key;
drop index if exists public.businesses_public_id_key;

-- 2) Add proper UNIQUE constraints
alter table public.businesses
  add constraint businesses_owner_user_id_key unique (owner_user_id);

-- public_id can stay nullable; UNIQUE allows multiple NULLs in Postgres (that’s fine)
alter table public.businesses
  add constraint businesses_public_id_key unique (public_id);
