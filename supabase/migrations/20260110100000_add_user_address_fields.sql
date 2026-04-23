alter table public.users
  add column if not exists address_2 text,
  add column if not exists state text,
  add column if not exists postal_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_state_format_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_state_format_check
      check (state is null or state = '' or state ~ '^[A-Z]{2}$');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_postal_code_format_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_postal_code_format_check
      check (
        postal_code is null
        or postal_code = ''
        or postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'
      );
  end if;
end $$;
