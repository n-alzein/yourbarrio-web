do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'businesses_owner_user_id_key'
      and conrelid = 'public.businesses'::regclass
  ) then
    drop index if exists public.businesses_owner_user_id_key;
    alter table public.businesses
      add constraint businesses_owner_user_id_key unique (owner_user_id);
  end if;
end $$;

-- public_id can stay nullable; UNIQUE allows multiple NULLs in Postgres (that's fine)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'businesses_public_id_key'
      and conrelid = 'public.businesses'::regclass
  ) then
    drop index if exists public.businesses_public_id_key;
    alter table public.businesses
      add constraint businesses_public_id_key unique (public_id);
  end if;
end $$;
