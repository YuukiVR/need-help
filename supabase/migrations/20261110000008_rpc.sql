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
