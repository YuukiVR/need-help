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
