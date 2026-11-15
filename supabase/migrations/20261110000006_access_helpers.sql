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
