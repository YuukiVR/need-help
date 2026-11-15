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
