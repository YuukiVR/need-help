-- 0011: consumer PWA - profile verification, SOS flag, identity storage, queue fields

begin;

-- Profiles: address, identity verification, terms consent
alter table public.profiles
  add column if not exists address_text text,
  add column if not exists address_lat double precision,
  add column if not exists address_lng double precision,
  add column if not exists selfie_path text,
  add column if not exists id_photo_path text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles(id);

alter table public.profiles
  drop constraint if exists profiles_verification_status_check,
  add constraint profiles_verification_status_check
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected'));

alter table public.profiles
  drop constraint if exists profiles_address_lat_range,
  add constraint profiles_address_lat_range check (address_lat is null or address_lat between -90 and 90),
  drop constraint if exists profiles_address_lng_range,
  add constraint profiles_address_lng_range check (address_lng is null or address_lng between -180 and 180);

-- Reports: mark SOS-originated reports for admin visibility
alter table public.reports
  add column if not exists is_sos boolean not null default false;

-- Identity photos bucket (private). Path convention: "<user_id>/<kind>_<uuid>.jpg"
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'identity-photos',
  'identity-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies for identity photos
drop policy if exists identity_photos_insert on storage.objects;
drop policy if exists identity_photos_select on storage.objects;
drop policy if exists identity_photos_update on storage.objects;
drop policy if exists identity_photos_delete on storage.objects;

create policy identity_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'identity-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy identity_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'identity-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

create policy identity_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'identity-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'identity-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy identity_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'identity-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

-- Allow consumers to update their own extended profile fields (role/active still guarded by trigger)
-- Existing policies profiles_update_self/profiles_update_admin already allow updates; trigger guards role/is_active.

-- Admin review of verification status
create or replace function public.review_profile_verification(
  p_profile uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can review verification' using errcode = '42501';
  end if;

  if p_status not in ('unverified', 'pending', 'verified', 'rejected') then
    raise exception 'invalid verification status' using errcode = '22023';
  end if;

  update public.profiles
     set verification_status = p_status,
         verified_at = case when p_status = 'verified' then now() else null end,
         verified_by = case when p_status = 'verified' then auth.uid() else null end
   where id = p_profile;

  if not found then
    raise exception 'profile % not found', p_profile using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.review_profile_verification(uuid, text) from public, anon;
grant execute on function public.review_profile_verification(uuid, text) to authenticated, service_role;

-- Extend admin queue view with SOS and reporter verification context.
-- Drop+create to allow adding columns without rename/ordering conflicts.
drop view if exists public.report_queue;

create view public.report_queue
with (security_invoker = true)
as
select
  r.id,
  r.ticket_no,
  r.type,
  r.status,
  r.priority,
  r.is_emergency,
  r.description,
  r.photo_path,
  r.address_text,
  r.lat,
  r.lng,
  r.created_at,
  r.updated_at,
  r.resolved_at,
  r.reporter_id,
  reporter.full_name  as reporter_name,
  reporter.phone      as reporter_phone,
  a.id                as assignment_id,
  a.status            as assignment_status,
  a.responder_id,
  responder.full_name as responder_name,
  responder.phone     as responder_phone,
  round(extract(epoch from (now() - r.created_at)) / 60)::int as age_minutes,
  r.is_sos,
  reporter.verification_status as reporter_verification_status
from public.reports r
join public.profiles reporter on reporter.id = r.reporter_id
left join public.assignments a
  on a.report_id = r.id
 and a.status in ('assigned', 'accepted', 'in_progress')
left join public.profiles responder on responder.id = a.responder_id;

grant select on public.report_queue to authenticated;

-- Consumers need to be able to mark SOS on insert (normalize_report controls sensitive fields;
-- allow is_sos to be set by reporter, but keep server authority on status/priority/emergency rules)
create or replace function public.normalize_report()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_actor public.user_role;
begin
  v_actor := case
    when auth.uid() is null then 'admin'::public.user_role
    else public.current_role_name()
  end;

  new.status      := 'new';
  new.resolved_at := null;
  new.updated_at  := now();
  new.is_sos      := coalesce(new.is_sos, false);

  if new.type = 'fire' then
    new.is_emergency := true;
  end if;

  if new.is_emergency or new.is_sos then
    new.is_emergency := true;
    new.priority := 'critical';
  elsif v_actor is distinct from 'admin' then
    new.priority := 'medium';
  end if;

  if v_actor is distinct from 'admin' then
    new.reporter_id := auth.uid();
    new.duplicate_of := null;
    new.created_at := now();
  end if;

  return new;
end;
$$;

commit;
