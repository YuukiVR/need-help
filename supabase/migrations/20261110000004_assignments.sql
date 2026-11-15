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
