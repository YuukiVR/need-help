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
