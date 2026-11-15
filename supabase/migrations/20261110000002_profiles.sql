-- 0002 — profiles: the people table and the role helpers

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  phone       text,
  role        public.user_role not null default 'consumer',
  zone        text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Application user. `role` is the single source of truth for authorization.';

create index profiles_role_idx on public.profiles (role) where is_active;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Every new auth user becomes a consumer automatically.
-- Admins and responders are promoted later (invite flow / SQL).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Role helpers ─────────────────────────────────────────────────────
-- SECURITY DEFINER so policies can read profiles without recursive RLS.

create or replace function public.current_role_name()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and is_active;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role = 'admin' from public.profiles p where p.id = auth.uid() and p.is_active),
    false
  );
$$;

revoke all on function public.current_role_name() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.current_role_name() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;

-- Users may edit their own name/phone/zone, but never their own role
-- or active flag. Service role / SQL editor (auth.uid() is null) bypasses.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_actor public.user_role;
begin
  if auth.uid() is null then
    return new; -- service role, SQL editor, seeds
  end if;

  v_actor := public.current_role_name();

  if new.role is distinct from old.role and v_actor is distinct from 'admin' then
    raise exception 'only admins can change roles' using errcode = '42501';
  end if;

  if new.is_active is distinct from old.is_active and v_actor is distinct from 'admin' then
    raise exception 'only admins can activate or deactivate accounts' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();
