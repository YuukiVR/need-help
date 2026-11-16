-- NeedHelp schema bundle: migrations in order, ready for the SQL Editor.
-- Paste this whole file into Supabase → SQL Editor and run it once, when
-- you cannot use the Supabase CLI (`supabase db push`).
--
-- Generated from supabase/migrations/. Do not edit by hand — change the
-- migration and run: node scripts/build-sql-bundle.mjs

-- =====================================================================
-- 20261110000001_init.sql
-- =====================================================================
-- 0001 — extensions, enums, shared helpers
-- Run order matters. Do not rename these files.

create extension if not exists pgcrypto with schema extensions;

-- Who a user is. This is the only source of truth for authorization.
create type public.user_role as enum ('admin', 'responder', 'consumer');

-- What is broken.
create type public.report_type as enum ('water', 'electricity', 'fire');

-- Lifecycle of a report.
create type public.report_status as enum (
  'new',        -- submitted, waiting for an admin
  'triaged',    -- admin reviewed it, not assigned yet
  'assigned',   -- a responder has been given the job
  'in_progress',-- responder started work
  'resolved',   -- job completed
  'cancelled',  -- reporter or admin cancelled it
  'duplicate'   -- merged into another report
);

create type public.priority_level as enum ('low', 'medium', 'high', 'critical');

-- Lifecycle of one responder's assignment.
create type public.assignment_state as enum (
  'assigned',   -- waiting for responder to accept
  'accepted',   -- responder took the job
  'declined',   -- responder refused, back to the admin queue
  'in_progress',-- work started
  'completed',  -- work finished
  'cancelled'   -- admin pulled the job
);

-- Reused by profiles and reports.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Supabase grants these by default; explicit grants keep the schema
-- portable and make the intent obvious.
grant usage on type public.user_role        to authenticated, service_role;
grant usage on type public.report_type      to authenticated, service_role;
grant usage on type public.report_status    to authenticated, service_role;
grant usage on type public.priority_level   to authenticated, service_role;
grant usage on type public.assignment_state to authenticated, service_role;

-- =====================================================================
-- 20261110000002_profiles.sql
-- =====================================================================
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

-- =====================================================================
-- 20261110000003_reports.sql
-- =====================================================================
-- 0003 — reports

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  -- Human-friendly number for phone calls and SMS: #1000, #1001, ...
  ticket_no    bigint generated always as identity (start with 1000) unique,
  reporter_id  uuid not null references public.profiles (id) on delete restrict,
  type         public.report_type not null,
  description  text,
  photo_path   text,             -- object path in the report-photos bucket
  lat          double precision,
  lng          double precision,
  address_text text,
  status       public.report_status not null default 'new',
  priority     public.priority_level not null default 'medium',
  is_emergency boolean not null default false,
  duplicate_of uuid references public.reports (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  constraint reports_description_len check (description is null or char_length(description) <= 2000),
  constraint reports_lat_range       check (lat is null or lat between -90 and 90),
  constraint reports_lng_range       check (lng is null or lng between -180 and 180),
  -- A fire is always an emergency, by definition.
  constraint reports_fire_is_emergency check (type <> 'fire' or is_emergency)
);

comment on column public.reports.ticket_no is 'Sequential reference shown to the reporter.';

-- Admin queue: status + priority + age.
create index reports_queue_idx on public.reports (status, priority, created_at);
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);
create index reports_created_idx on public.reports (created_at desc);
create index reports_open_idx
  on public.reports (created_at)
  where status not in ('resolved', 'cancelled', 'duplicate');

create trigger reports_touch_updated_at
  before update on public.reports
  for each row execute function public.touch_updated_at();

-- Server-side normalisation: clients cannot fake priority, status,
-- or report on behalf of somebody else.
create or replace function public.normalize_report()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_actor public.user_role;
begin
  -- auth.uid() is null for service role, SQL editor and seeds: treat as trusted.
  v_actor := case
    when auth.uid() is null then 'admin'::public.user_role
    else public.current_role_name()
  end;

  new.status      := 'new';
  new.resolved_at := null;
  new.updated_at  := now();

  if new.type = 'fire' then
    new.is_emergency := true;
  end if;

  if new.is_emergency then
    new.priority := 'critical';
  elsif v_actor is distinct from 'admin' then
    new.priority := 'medium';
  end if;

  if v_actor is distinct from 'admin' then
    new.reporter_id := auth.uid();
    new.duplicate_of := null;
    new.created_at := now(); -- no backdating to dodge rate limits / SLA
  end if;

  return new;
end;
$$;

create trigger reports_normalize
  before insert on public.reports
  for each row execute function public.normalize_report();

-- Basic abuse protection: max 10 reports per user per hour.
-- Raise the number if a real outage makes people report repeatedly.
create or replace function public.limit_reports_per_hour()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    return new; -- service role / SQL editor / seeds
  end if;

  select count(*) into v_count
  from public.reports
  where reporter_id = auth.uid()
    and created_at > now() - interval '1 hour';

  if v_count >= 10 then
    raise exception 'too many reports, please try again later' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger reports_limit_rate
  before insert on public.reports
  for each row execute function public.limit_reports_per_hour();

-- =====================================================================
-- 20261110000004_assignments.sql
-- =====================================================================
-- 0004 — assignments: which responder owns which report

create table public.assignments (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.reports (id) on delete cascade,
  responder_id  uuid not null references public.profiles (id) on delete restrict,
  assigned_by   uuid not null references public.profiles (id) on delete restrict,
  status        public.assignment_state not null default 'assigned',
  note          text,
  decline_reason text,
  assigned_at   timestamptz not null default now(),
  accepted_at   timestamptz,
  started_at    timestamptz,
  completed_at  timestamptz,
  unique (report_id, responder_id),
  constraint assignments_note_len check (note is null or char_length(note) <= 2000)
);

-- One active responder per report. Completed/declined/cancelled history stays.
create unique index assignments_one_active_idx
  on public.assignments (report_id)
  where status in ('assigned', 'accepted', 'in_progress');

create index assignments_responder_idx
  on public.assignments (responder_id, status, assigned_at desc);

-- =====================================================================
-- 20261110000005_report_events.sql
-- =====================================================================
-- 0005 — report_events: append-only timeline / audit trail

create table public.report_events (
  id         bigint generated always as identity primary key,
  report_id  uuid not null references public.reports (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  kind       text not null default 'comment',
  message    text,
  photo_path text,
  created_at timestamptz not null default now(),
  constraint report_events_kind check (kind in ('comment', 'status', 'assignment', 'photo', 'system')),
  constraint report_events_message_len check (message is null or char_length(message) <= 2000)
);

create index report_events_report_idx on public.report_events (report_id, created_at);

-- Clients may omit author_id; default it to the caller so the insert
-- policy (author_id = auth.uid()) is easy to satisfy.
create or replace function public.set_event_author()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.author_id is null then
    new.author_id := auth.uid();
  end if;
  return new;
end;
$$;

create trigger report_events_set_author
  before insert on public.report_events
  for each row execute function public.set_event_author();

-- Write the audit trail from the database, not from client code, so a
-- forgotten API call can never leave a report without history.
create or replace function public.log_report_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.report_events (report_id, author_id, kind, message)
  values (new.id, auth.uid(), 'system', 'Report created');
  return new;
end;
$$;

create trigger reports_log_created
  after insert on public.reports
  for each row execute function public.log_report_created();

create or replace function public.log_report_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.report_events (report_id, author_id, kind, message)
    values (new.id, auth.uid(), 'status', old.status::text || ' → ' || new.status::text);
  end if;
  return new;
end;
$$;

create trigger reports_log_status
  after update on public.reports
  for each row execute function public.log_report_status();

-- =====================================================================
-- 20261110000006_access_helpers.sql
-- =====================================================================
-- 0006 — access helpers used by RLS policies
--
-- Every helper is SECURITY DEFINER so a policy can ask "can this user see
-- this row?" without triggering RLS on reports/assignments again. Direct
-- subqueries in policies are the classic cause of
-- "infinite recursion detected in policy for relation ...".

create or replace function public.is_responder_assigned(p_report uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role_name() = 'responder'
     and exists (
       select 1
       from public.assignments a
       where a.report_id = p_report
         and a.responder_id = auth.uid()
         and a.status <> 'cancelled'
     );
$$;

create or replace function public.can_view_report(p_report uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.reports r
    where r.id = p_report
      and (
        r.reporter_id = auth.uid()
        or public.is_admin()
        or public.is_responder_assigned(r.id)
      )
  );
$$;

-- A responder may see the reporter's name/phone only while the job is theirs.
-- A reporter may see the responder who was sent to them.
create or replace function public.can_view_profile(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_profile = auth.uid()
      or public.is_admin()
      or exists (
        select 1
        from public.assignments a
        join public.reports r on r.id = a.report_id
        where a.responder_id = auth.uid()
          and a.status <> 'cancelled'
          and r.reporter_id = p_profile
      )
      or exists (
        select 1
        from public.assignments a
        join public.reports r on r.id = a.report_id
        where a.responder_id = p_profile
          and r.reporter_id = auth.uid()
          and a.status <> 'cancelled'
      );
$$;

-- Storage objects are stored as "<report_id>/<filename>".
-- Never cast blindly: a malformed path must return false, not raise.
create or replace function public.can_view_report_path(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_report uuid;
begin
  begin
    v_report := split_part(p_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;

  return public.can_view_report(v_report);
end;
$$;

revoke all on function public.is_responder_assigned(uuid) from public, anon;
revoke all on function public.can_view_report(uuid) from public, anon;
revoke all on function public.can_view_profile(uuid) from public, anon;
revoke all on function public.can_view_report_path(text) from public, anon;

grant execute on function public.is_responder_assigned(uuid) to authenticated, service_role;
grant execute on function public.can_view_report(uuid) to authenticated, service_role;
grant execute on function public.can_view_profile(uuid) to authenticated, service_role;
grant execute on function public.can_view_report_path(text) to authenticated, service_role;

-- =====================================================================
-- 20261110000007_rls.sql
-- =====================================================================
-- 0007 — row level security
--
-- The client is never trusted. Even if someone calls the REST API directly
-- with the anon key and a forged UI, these policies decide what they see.

alter table public.profiles      enable row level security;
alter table public.reports       enable row level security;
alter table public.assignments   enable row level security;
alter table public.report_events enable row level security;

-- ─── profiles ─────────────────────────────────────────────────────────
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    public.can_view_profile(id)
    or (
      public.current_role_name() = 'responder'
      and role in ('responder', 'admin')
      and is_active
    )
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ─── reports ──────────────────────────────────────────────────────────
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and status = 'new'
    and duplicate_of is null
  );

create policy reports_select on public.reports
  for select to authenticated
  using (
    reporter_id = auth.uid()
    or public.is_admin()
    or public.is_responder_assigned(id)
  );

-- Admins can triage, edit, reassign, and delete.
create policy reports_admin_all on public.reports
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ─── assignments ──────────────────────────────────────────────────────
create policy assignments_select on public.assignments
  for select to authenticated
  using (
    responder_id = auth.uid()
    or public.is_admin()
    or public.can_view_report(report_id)
  );

-- Only admins may write directly. Responders change state through the
-- SECURITY DEFINER RPCs in 0008, which enforce valid transitions.
create policy assignments_admin_all on public.assignments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ─── report_events ────────────────────────────────────────────────────
create policy report_events_select on public.report_events
  for select to authenticated
  using (public.can_view_report(report_id));

create policy report_events_insert on public.report_events
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.can_view_report(report_id)
    -- clients may only post comments/photos; status and assignment
    -- events are written by the database and the RPCs
    and (public.is_admin() or kind in ('comment', 'photo'))
  );

-- =====================================================================
-- 20261110000008_rpc.sql
-- =====================================================================
-- 0008 — RPCs: every state change goes through a checked function
--
-- SECURITY DEFINER functions bypass RLS, so each one re-checks auth.uid()
-- and the current state before touching anything. Revoke EXECUTE from
-- PUBLIC/anon afterwards (Postgres grants EXECUTE to PUBLIC by default).

-- ─── Admin: assign a report to a responder ────────────────────────────
create or replace function public.assign_report(
  p_report    uuid,
  p_responder uuid,
  p_note      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status     public.report_status;
  v_assignment uuid;
begin
  if not public.is_admin() then
    raise exception 'only admins can assign reports' using errcode = '42501';
  end if;

  select status into v_status
  from public.reports
  where id = p_report
  for update;

  if not found then
    raise exception 'report % not found', p_report using errcode = 'P0002';
  end if;

  if v_status in ('resolved', 'cancelled', 'duplicate') then
    raise exception 'report is already %', v_status using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_responder
      and role = 'responder'
      and is_active
  ) then
    raise exception 'responder not found or inactive' using errcode = 'P0002';
  end if;

  -- One active responder per report: cancel any other active assignment.
  update public.assignments
     set status = 'cancelled'
   where report_id = p_report
     and responder_id <> p_responder
     and status in ('assigned', 'accepted', 'in_progress');

  insert into public.assignments (report_id, responder_id, assigned_by, note)
  values (p_report, p_responder, auth.uid(), p_note)
  on conflict (report_id, responder_id) do update
     set status        = 'assigned',
         assigned_by   = excluded.assigned_by,
         note          = excluded.note,
         assigned_at   = now(),
         accepted_at   = null,
         started_at    = null,
         completed_at  = null,
         decline_reason = null
  returning id into v_assignment;

  update public.reports
     set status = 'assigned'
   where id = p_report;

  insert into public.report_events (report_id, author_id, kind, message)
  values (p_report, auth.uid(), 'assignment', 'Assigned to responder');

  return v_assignment;
end;
$$;

-- ─── Responder: accept ────────────────────────────────────────────────
create or replace function public.accept_assignment(p_assignment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report uuid;
begin
  if public.current_role_name() is distinct from 'responder' then
    raise exception 'active responder account required' using errcode = '42501';
  end if;

  update public.assignments
     set status = 'accepted',
         accepted_at = now()
   where id = p_assignment
     and responder_id = auth.uid()
     and status = 'assigned'
  returning report_id into v_report;

  if not found then
    raise exception 'assignment is not available to you' using errcode = 'P0001';
  end if;

  insert into public.report_events (report_id, author_id, kind, message)
  values (v_report, auth.uid(), 'assignment', 'Responder accepted the job');
end;
$$;

-- ─── Responder: start work ────────────────────────────────────────────
create or replace function public.start_assignment(p_assignment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report uuid;
begin
  if public.current_role_name() is distinct from 'responder' then
    raise exception 'active responder account required' using errcode = '42501';
  end if;

  update public.assignments
     set status = 'in_progress',
         started_at = now()
   where id = p_assignment
     and responder_id = auth.uid()
     and status = 'accepted'
  returning report_id into v_report;

  if not found then
    raise exception 'assignment cannot be started' using errcode = 'P0001';
  end if;

  update public.reports
     set status = 'in_progress'
   where id = v_report;

  insert into public.report_events (report_id, author_id, kind, message)
  values (v_report, auth.uid(), 'assignment', 'Work started');
end;
$$;

-- ─── Responder: complete ──────────────────────────────────────────────
create or replace function public.complete_assignment(
  p_assignment uuid,
  p_note       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report uuid;
begin
  if public.current_role_name() is distinct from 'responder' then
    raise exception 'active responder account required' using errcode = '42501';
  end if;

  update public.assignments
     set status = 'completed',
         completed_at = now(),
         note = coalesce(p_note, note)
   where id = p_assignment
     and responder_id = auth.uid()
     and status in ('accepted', 'in_progress')
  returning report_id into v_report;

  if not found then
    raise exception 'assignment cannot be completed' using errcode = 'P0001';
  end if;

  update public.reports
     set status = 'resolved',
         resolved_at = now()
   where id = v_report;

  insert into public.report_events (report_id, author_id, kind, message)
  values (v_report, auth.uid(), 'assignment', coalesce(p_note, 'Job completed'));
end;
$$;

-- ─── Responder: decline ───────────────────────────────────────────────
create or replace function public.decline_assignment(
  p_assignment uuid,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report uuid;
begin
  if public.current_role_name() is distinct from 'responder' then
    raise exception 'active responder account required' using errcode = '42501';
  end if;

  update public.assignments
     set status = 'declined',
         decline_reason = coalesce(p_reason, 'No reason given'),
         completed_at = now()
   where id = p_assignment
     and responder_id = auth.uid()
     and status = 'assigned'
  returning report_id into v_report;

  if not found then
    raise exception 'assignment cannot be declined' using errcode = 'P0001';
  end if;

  -- Back to the admin queue.
  update public.reports
     set status = 'triaged'
   where id = v_report
     and status = 'assigned';

  insert into public.report_events (report_id, author_id, kind, message)
  values (v_report, auth.uid(), 'assignment',
          'Responder declined: ' || coalesce(p_reason, 'no reason given'));
end;
$$;

-- ─── Consumer: cancel own report ──────────────────────────────────────
create or replace function public.cancel_own_report(p_report uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reports
     set status = 'cancelled'
   where id = p_report
     and reporter_id = auth.uid()
     and status in ('new', 'triaged');

  if not found then
    raise exception 'this report can no longer be cancelled' using errcode = 'P0001';
  end if;
end;
$$;

-- ─── Consumer: attach a photo to their own report ─────────────────────
-- Flow: insert report → upload to "<report_id>/<file>" → call this RPC.
-- (Upload before insert would fail: the storage policy needs the report
-- row to exist so it can check ownership.)
create or replace function public.attach_report_photo(
  p_report uuid,
  p_path   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_path is null or split_part(p_path, '/', 1) <> p_report::text then
    raise exception 'photo path must start with the report id' using errcode = '22023';
  end if;

  update public.reports
     set photo_path = p_path
   where id = p_report
     and reporter_id = auth.uid()
     and status in ('new', 'triaged');

  if not found then
    raise exception 'cannot attach a photo to this report' using errcode = 'P0001';
  end if;
end;
$$;

-- ─── Admin: pull a job back ───────────────────────────────────────────
create or replace function public.cancel_assignment(
  p_assignment uuid,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report uuid;
begin
  if not public.is_admin() then
    raise exception 'only admins can cancel assignments' using errcode = '42501';
  end if;

  update public.assignments
     set status = 'cancelled',
         decline_reason = coalesce(p_reason, decline_reason)
   where id = p_assignment
     and status in ('assigned', 'accepted', 'in_progress')
  returning report_id into v_report;

  if not found then
    raise exception 'assignment cannot be cancelled' using errcode = 'P0001';
  end if;

  update public.reports
     set status = 'triaged'
   where id = v_report
     and status in ('assigned', 'in_progress');

  insert into public.report_events (report_id, author_id, kind, message)
  values (v_report, auth.uid(), 'assignment',
          'Assignment cancelled: ' || coalesce(p_reason, 'no reason given'));
end;
$$;

-- ─── Admin: triage ────────────────────────────────────────────────────
create or replace function public.triage_report(
  p_report   uuid,
  p_priority public.priority_level default null,
  p_status   public.report_status default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can triage reports' using errcode = '42501';
  end if;

  update public.reports
     set priority = coalesce(p_priority, priority),
         status   = coalesce(p_status, status),
         resolved_at = case
           when coalesce(p_status, status) = 'resolved'
             then coalesce(resolved_at, now())
           else resolved_at
         end
   where id = p_report;

  if not found then
    raise exception 'report % not found', p_report using errcode = 'P0002';
  end if;
end;
$$;

-- ─── Privileges ───────────────────────────────────────────────────────
revoke all on function public.assign_report(uuid, uuid, text)          from public, anon;
revoke all on function public.accept_assignment(uuid)                  from public, anon;
revoke all on function public.start_assignment(uuid)                   from public, anon;
revoke all on function public.complete_assignment(uuid, text)          from public, anon;
revoke all on function public.decline_assignment(uuid, text)           from public, anon;
revoke all on function public.cancel_own_report(uuid)                  from public, anon;
revoke all on function public.attach_report_photo(uuid, text)          from public, anon;
revoke all on function public.cancel_assignment(uuid, text)            from public, anon;
revoke all on function public.triage_report(uuid, public.priority_level, public.report_status) from public, anon;

grant execute on function public.assign_report(uuid, uuid, text)       to authenticated, service_role;
grant execute on function public.accept_assignment(uuid)               to authenticated, service_role;
grant execute on function public.start_assignment(uuid)                to authenticated, service_role;
grant execute on function public.complete_assignment(uuid, text)       to authenticated, service_role;
grant execute on function public.decline_assignment(uuid, text)        to authenticated, service_role;
grant execute on function public.cancel_own_report(uuid)               to authenticated, service_role;
grant execute on function public.attach_report_photo(uuid, text)       to authenticated, service_role;
grant execute on function public.cancel_assignment(uuid, text)         to authenticated, service_role;
grant execute on function public.triage_report(uuid, public.priority_level, public.report_status) to authenticated, service_role;

-- =====================================================================
-- 20261110000009_storage_view_realtime.sql
-- =====================================================================
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

-- =====================================================================
-- 20261110000010_profile_email.sql
-- =====================================================================
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

-- =====================================================================
-- 20261116000011_consumer_pwa.sql
-- =====================================================================
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
