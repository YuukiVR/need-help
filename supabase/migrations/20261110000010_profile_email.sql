-- 0010 — email on profiles
--
-- The admin Users page shows who an account belongs to. Email lives in
-- auth.users, which the client cannot read, so mirror it onto profiles.
--
-- Privacy note: RLS decides who sees a profile row. Admins see all rows,
-- responders see peers and the reporter of an assigned job, consumers see
-- only themselves.

alter table public.profiles add column if not exists email text;

-- Backfill existing users.
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and p.email is distinct from u.email;

create index if not exists profiles_email_idx on public.profiles (lower(email));

-- New signups keep the email, and re-running the trigger updates it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    new.email
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

-- Keep the mirror in sync if an auth email changes later.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set email = new.email
   where id = new.id
     and email is distinct from new.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();
