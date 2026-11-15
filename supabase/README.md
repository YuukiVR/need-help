# Phase 1 — Supabase schema

Everything needed for the report → triage → assign → repair → resolve loop,
including the role rules. No frontend required to test it.

## What you get

| Table / object | Purpose |
|---|---|
| `profiles` | One row per auth user. `role` is the only source of truth for authorization. |
| `reports` | A water / electricity / fire report, with ticket number, photo, GPS, priority, status. |
| `assignments` | Which responder owns which report, and its progress. |
| `report_events` | Append-only timeline: status changes, assignments, comments, photos. |
| `report_queue` (view) | Ready-made admin/responder queue with reporter + responder names and age in minutes. |
| `report-photos` (bucket) | Private photo storage, one folder per report. |
| RPCs | `assign_report`, `accept_assignment`, `start_assignment`, `complete_assignment`, `decline_assignment`, `cancel_own_report`, `cancel_assignment`, `attach_report_photo`, `triage_report`. |

### Status model

```
report:    new → triaged → assigned → in_progress → resolved
                                ↘ cancelled / duplicate

assignment: assigned → accepted → in_progress → completed
                  ↘ declined → report goes back to triaged
```

### Who can do what (enforced by Postgres, not the UI)

| | consumer | responder | admin |
|---|---|---|---|
| create report | own only | — | any |
| read reports | own | assigned only | all |
| read reporter phone | own | only while assigned | all |
| change priority | — | — | ✅ |
| assign responder | — | — | ✅ |
| accept / start / complete | — | own assignments | ✅ |
| change own role | — | — | — (trigger blocks it) |

Notes:

- `user_metadata` (from signup) is **user-editable**, so the role is never read
  from it. It lives only in `public.profiles` and is guarded by a trigger.
- A reporter can see the name/phone of the responder assigned to their report,
  and a responder can see the reporter's contact while the job is theirs.
- Consumers are rate-limited to 10 reports per hour (adjust in
  `limit_reports_per_hour`).

---

## Option A — run locally (recommended)

Prerequisites: **Docker Desktop**, **Node 20+**, **Supabase CLI**.

```powershell
# 1. Install the CLI (one time)
npm install -g supabase

# 2. From the project root
supabase start          # first run downloads images, takes a few minutes
supabase db reset       # applies migrations 0001→0010
supabase status         # copy API URL + anon key into .env.local
```

`supabase db reset` is destructive but local-only. Run it whenever you change
a migration.

At this point the schema exists but there are no users, so the seed file does
nothing. Create the three accounts (below), then run `supabase/seed.sql` once
in the SQL editor to get sample reports. Do **not** run `db reset` after
creating users — it would delete them.

Studio (a local admin UI for the database) is at <http://127.0.0.1:54323>.

## Option B — hosted Supabase project

1. Create a project at <https://supabase.com> (free tier).
2. Link and push:

```powershell
supabase link --project-ref <your-project-ref>
supabase db push
```

3. Create the three demo users, then run `seed.sql` once in the SQL editor
   (see below). `db push` does not run the seed file.

> Never edit a migration that has already been applied. Add a new file
> `2026..._fix_something.sql` instead. Supabase records applied versions.

---

## Create the three roles

Studio → **Authentication → Users → Add user**. Create:

| Email | Password | Role after promotion |
|---|---|---|
| `admin@example.com` | anything ≥ 6 chars | admin |
| `responder@example.com` | anything ≥ 6 chars | responder |
| `consumer@example.com` | anything ≥ 6 chars | consumer |

Tick **Auto Confirm User** so you can sign in immediately.

The `on_auth_user_created` trigger creates a `profiles` row as `consumer` for
every new user. Promote the other two in the SQL editor:

```sql
update public.profiles p
   set role = 'admin'
  from auth.users u
 where u.id = p.id and u.email = 'admin@example.com';

update public.profiles p
   set role = 'responder'
  from auth.users u
 where u.id = p.id and u.email = 'responder@example.com';
```

If a profile is missing (user was created before the trigger existed):

```sql
insert into public.profiles (id, full_name)
select id, split_part(email, '@', 1)
from auth.users
where email = 'admin@example.com'
on conflict (id) do nothing;
```

Then run `supabase/seed.sql` to get three sample reports.

---

## Verify the security rules

The SQL editor runs as `postgres` and **bypasses RLS**, so test with `psql`
(or the app). Local connection string:

```
postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Get the UUIDs first:

```sql
select id, email, role from public.profiles order by role;
```

### 1. A consumer sees only their own reports

```sql
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<consumer-uuid>', 'role', 'authenticated')::text,
  true
);

select count(*) from public.reports;    -- 3 (their seeded reports)
select count(*) from public.profiles;   -- 1 (only themselves)
rollback;
```

### 2. A responder sees nothing until assigned

```sql
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<responder-uuid>', 'role', 'authenticated')::text,
  true
);

select count(*) from public.reports;    -- 0
rollback;
```

Then, as admin (SQL editor, or the admin app):

```sql
select public.assign_report(
  (select id from public.reports where type = 'water' limit 1),
  (select id from public.profiles where role = 'responder' limit 1),
  'Please check the main valve'
);
```

Re-run the responder check: now `1`, and only that report.

### 3. Nobody can promote themselves

```sql
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<consumer-uuid>', 'role', 'authenticated')::text,
  true
);

update public.profiles set role = 'admin' where id = auth.uid();
-- ERROR: only admins can change roles
rollback;
```

### 4. A responder can only touch their own job

```sql
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<other-responder-uuid>', 'role', 'authenticated')::text,
  true
);

select public.complete_assignment('<assignment-id>');
-- ERROR: assignment cannot be completed
rollback;
```

---

## Client calls (what Phase 1 frontend will use)

```ts
// consumer: create a report
const { data: report } = await supabase
  .from('reports')
  .insert({
    type: 'water',
    description: 'No water since 6am',
    lat: 14.5995,
    lng: 120.9842,
    address_text: '12 Mabini St',
  })
  .select('id, ticket_no, status')
  .single();

// consumer: photo — upload after insert, then attach
await supabase.storage
  .from('report-photos')
  .upload(`${report.id}/${crypto.randomUUID()}.jpg`, compressedFile, {
    contentType: 'image/jpeg',
  });

await supabase.rpc('attach_report_photo', {
  p_report: report.id,
  p_path: `${report.id}/${fileName}`,
});

// admin: live queue
const { data: queue } = await supabase
  .from('report_queue')
  .select('*')
  .neq('status', 'resolved')
  .order('priority', { ascending: false })
  .order('created_at');

// admin: assign
await supabase.rpc('assign_report', {
  p_report: reportId,
  p_responder: responderId,
  p_note: 'Bring a pipe wrench',
});

// responder: my jobs
const { data: jobs } = await supabase
  .from('assignments')
  .select('*, report:reports(*)')
  .in('status', ['assigned', 'accepted', 'in_progress']);

// responder: progress
await supabase.rpc('accept_assignment',  { p_assignment: id });
await supabase.rpc('start_assignment',   { p_assignment: id });
await supabase.rpc('complete_assignment',{ p_assignment: id, p_note: 'Valve replaced' });

// anyone with access: comment
await supabase.from('report_events').insert({
  report_id: reportId,
  kind: 'comment',
  message: 'Crew is on the way',
});
```

Realtime: subscribe to `reports` and `assignments` changes for the admin queue
and responder list (already added to the `supabase_realtime` publication).

---

## Common errors

| Error | Cause / fix |
|---|---|
| `infinite recursion detected in policy for relation` | A policy queried its own table directly. Use the `can_view_report` / `is_admin` helpers (already done). |
| `permission denied for function ...` | Missing `grant execute`. The RPC file handles it; check you ran 0008. |
| `new row violates row-level security policy` | Client did not set `reporter_id`/`author_id`, tried to set `status` on insert, or tried to insert an event of kind `status`. |
| `too many reports, please try again later` | Rate limit: 10 reports per user per hour. Raise the number in `limit_reports_per_hour`. |
| New auth user has no `profiles` row | The `on_auth_user_created` trigger is missing — re-run 0002 or insert the profile manually. |
| Realtime sends nothing | Table not in the `supabase_realtime` publication, or RLS hides the row from that user (by design). |
| `supabase start` fails | Docker Desktop not running, or ports 54321–54324 are taken. |
| Storage upload 403 | The report must exist before uploading; path must be `<report_id>/<file>`. |

---

## Files

```
supabase/
  config.toml
  seed.sql
  migrations/
    20261110000001_init.sql               extensions, enums, touch trigger
    20261110000002_profiles.sql           profiles, new-user trigger, role guards
    20261110000003_reports.sql            reports + normalization
    20261110000004_assignments.sql        assignments + one-active-per-report
    20261110000005_report_events.sql      timeline + audit triggers
    20261110000006_access_helpers.sql     SECURITY DEFINER visibility helpers
    20261110000007_rls.sql                row level security policies
    20261110000008_rpc.sql                state-changing functions
    20261110000009_storage_view_realtime.sql  bucket, queue view, realtime
    20261110000010_profile_email.sql      email mirror on profiles (users list)
```

## Next

The admin web console (login, dashboard, reports, users) is built — see the
root [`README.md`](../README.md). Still to do:

1. Consumer mobile flow: report form (type, description, GPS, photo).
2. Responder mobile flow: job list with accept / start / complete.
3. Push notifications for new assignments.
