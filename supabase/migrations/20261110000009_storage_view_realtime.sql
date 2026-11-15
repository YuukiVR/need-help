-- 0009 — storage bucket, admin queue view, realtime publication

-- ─── Photos ───────────────────────────────────────────────────────────
-- Private bucket. Files are stored as "<report_id>/<uuid>.jpg" and are
-- only readable through the policies below (or a signed URL).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-photos',
  'report-photos',
  false,
  10485760, -- 10 MiB hard cap; the client compresses to ~300 KB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy report_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'report-photos'
    and public.can_view_report_path(name)
  );

create policy report_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'report-photos'
    and public.can_view_report_path(name)
  );

create policy report_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'report-photos'
    and (
      public.is_admin()
      or exists (
        select 1
        from public.reports r
        where r.id::text = split_part(name, '/', 1)
          and r.reporter_id = auth.uid()
          and r.status = 'new'
      )
    )
  );

-- ─── Admin queue view ─────────────────────────────────────────────────
-- security_invoker = true means the caller's RLS still applies, so the
-- same view is safe for admins, responders and consumers.
create or replace view public.report_queue
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
  round(extract(epoch from (now() - r.created_at)) / 60)::int as age_minutes
from public.reports r
join public.profiles reporter on reporter.id = r.reporter_id
left join public.assignments a
  on a.report_id = r.id
 and a.status in ('assigned', 'accepted', 'in_progress')
left join public.profiles responder on responder.id = a.responder_id;

grant select on public.report_queue to authenticated;

-- Public liveness probe: used by uptime monitors and the free-tier
-- keep-alive ping (a project with no API traffic pauses after ~7 days).
create or replace view public.health
with (security_invoker = true) as
select 1 as ok;

grant select on public.health to anon, authenticated;

-- Supabase applies these grants by default; repeat them explicitly so the
-- schema also works on a plain Postgres instance. RLS still decides rows.
grant select, insert, update, delete
  on public.profiles, public.reports, public.assignments, public.report_events
  to authenticated;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- ─── Realtime ─────────────────────────────────────────────────────────
-- The admin queue and responder job list subscribe to these tables.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.reports;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.assignments;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.report_events;
exception when duplicate_object then null;
end $$;
