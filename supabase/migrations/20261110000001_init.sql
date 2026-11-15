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
