# Utility Outage Reporting System — Free-Tier Architecture Plan

**Scope:** consumers report no water / no electricity / fire, admins triage and assign responders, responders accept the job, do the repair, and close it out. Three roles, one backend.

**Design goal:** $0/month to run and $0 for users to access, without app-store fees, while still being a real production-grade system that can grow.

---

## 1. Key decisions (the short version)

| Decision | Choice | Why |
|---|---|---|
| Backend / DB / Auth | **Supabase** (Postgres + Auth + Storage + Realtime) | Free tier is generous, gives you real SQL, row-level security for the 3 roles, file storage for photos, and live updates for the admin feed. |
| Frontend | **One responsive React + Vite PWA**, role-based routing | Admin uses it on desktop, responders/consumers install it on their phones. No Apple ($99/yr) or Google ($25) developer fees, no app-store review. |
| Hosting | **Cloudflare Pages** (free, commercial use allowed) | Unlimited static requests, free HTTPS, free `*.pages.dev` subdomain. Vercel Hobby is free but its terms forbid commercial use, which may apply if a utility company runs this. |
| Maps | **Leaflet + OpenStreetMap** | Free, no billing account, no API key. |
| Photos | Supabase Storage + client-side compression | 1 GB free goes a long way when images are resized to ~1280px. |
| Push notifications | **OneSignal free tier** (or web-push in a Supabase Edge Function) | Works on Android and on iOS 16.4+ for installed PWAs. |
| Transactional email | **Resend free tier** as Supabase custom SMTP | Supabase's built-in SMTP is rate-limited and not meant for production. |
| Mobile app (later) | **Expo / React Native** | Only needed if you require background GPS, native camera UX, or Play Store distribution. |

**Why PWA-first instead of native-first:** "make it free so people can access it" is mostly a distribution problem. A PWA is a URL — no install required to file a report, no store fees, instant updates, and it works on low-end Android. You can wrap it in Expo later without changing the backend.

---

## 2. Architecture

```
                    ┌─────────────────────────────────────────┐
                    │  Cloudflare Pages (free, HTTPS, PWA)    │
                    │  React + Vite + TS + Tailwind + shadcn  │
                    │                                         │
                    │  /login  /report  /my-reports           │
                    │  /admin  /admin/reports  /admin/map     │
                    │  /responder  /responder/jobs            │
                    └───────────────┬─────────────────────────┘
                                    │ supabase-js (JWT)
                                    ▼
        ┌───────────────────────────────────────────────────────┐
        │  Supabase (free tier)                                 │
        │  ├─ Auth        email/password (+ magic link)         │
        │  ├─ Postgres    RLS enforces the 3 roles              │
        │  ├─ Storage     report photos (private bucket)        │
        │  ├─ Realtime    live admin queue + job updates        │
        │  └─ Edge Fn     push notify, SLA escalation, digests  │
        └───────────────┬───────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │ OneSignal (push)              │ Resend (email OTP)
        │ Leaflet + OSM (maps)          │ cron-job.org (keep-alive)
        └───────────────────────────────┘
```

Everything above is free. The only optional cost is a custom domain (~$10–15/year); `your-app.pages.dev` is free.

---

## 3. Roles and permissions

| Action | Consumer | Responder | Admin |
|---|---|---|---|
| Sign up / sign in | ✅ | invited only | invited only |
| Create report (water/electricity/fire) | ✅ own | ❌ | ✅ |
| See own reports + status | ✅ | — | ✅ |
| See all reports | ❌ | only assigned | ✅ |
| See reporter contact | own only | on assigned job | ✅ |
| Triage: set priority / mark duplicate | ❌ | ❌ | ✅ |
| Assign responder | ❌ | ❌ | ✅ |
| Accept / decline job | ❌ | ✅ | — |
| Update job status → in progress → done | ❌ | ✅ assigned | ✅ |
| Add comment / photo to job | ✅ own report | ✅ assigned | ✅ |
| Manage users, roles, zones | ❌ | ❌ | ✅ |
| Dashboard, map, SLA metrics | ❌ | own stats | ✅ |

**Important:** never trust the client for role checks. The role lives in `profiles` and is enforced by Postgres RLS, so a tampered frontend still cannot read other people's reports.

**Signup policy:** consumers self-register (email + password, optional phone). Responders and admins are created by an admin — otherwise anyone could claim to be a responder. Use an invite flow: admin enters an email, Edge Function sends a Supabase invite, the trigger creates the profile with the right role.

---

## 4. Database schema

Postgres via Supabase. This is the v1 schema; it covers reporting, triage, assignment, and the audit trail.

```sql
-- ─── Enums ────────────────────────────────────────────────────────────
create type user_role        as enum ('admin','responder','consumer');
create type report_type      as enum ('water','electricity','fire');
create type report_status    as enum ('new','triaged','assigned','in_progress','resolved','cancelled','duplicate');
create type priority_level   as enum ('low','medium','high','critical');
create type assignment_state as enum ('assigned','accepted','declined','in_progress','completed','cancelled');

-- ─── People ───────────────────────────────────────────────────────────
create table profiles (
  id         uuid primary key references auth.users on delete cascade,
  full_name  text not null,
  phone      text,
  role       user_role not null default 'consumer',
  zone       text,                        -- optional service area
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─── Reports ──────────────────────────────────────────────────────────
create table reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references profiles(id),
  type         report_type not null,
  description  text,
  photo_path   text,                      -- Supabase Storage object path
  lat          double precision,
  lng          double precision,
  address_text text,
  status       report_status not null default 'new',
  priority     priority_level not null default 'medium',
  is_emergency boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  constraint fire_is_emergency check (type <> 'fire' or is_emergency = true)
);
create index reports_status_idx  on reports (status, priority, created_at);
create index reports_reporter_idx on reports (reporter_id);
create index reports_geo_idx     on reports (lat, lng);

-- ─── Assignments ──────────────────────────────────────────────────────
create table assignments (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references reports(id) on delete cascade,
  responder_id uuid not null references profiles(id),
  assigned_by  uuid not null references profiles(id),
  status       assignment_state not null default 'assigned',
  note         text,
  assigned_at  timestamptz not null default now(),
  accepted_at  timestamptz,
  completed_at timestamptz,
  unique (report_id, responder_id)
);
create index assignments_responder_idx on assignments (responder_id, status);

-- ─── Timeline / audit trail ───────────────────────────────────────────
create table report_events (
  id         bigint generated always as identity primary key,
  report_id  uuid not null references reports(id) on delete cascade,
  author_id  uuid references profiles(id),
  kind       text not null default 'comment',  -- comment | status | assignment | photo
  message    text,
  photo_path text,
  created_at timestamptz not null default now()
);
create index report_events_report_idx on report_events (report_id, created_at);
```

### 4.1 Profile bootstrap + role protection

```sql
-- Every new auth user gets a consumer profile automatically.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'phone',
    'consumer'
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Helper used by every policy (security definer avoids RLS recursion).
create or replace function current_role_name()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Users may edit their name/phone but never their own role.
create or replace function prevent_role_escalation()
returns trigger language plpgsql as $$
begin
  if new.role <> old.role and current_role_name() <> 'admin' then
    raise exception 'only admins can change roles';
  end if;
  return new;
end $$;

create trigger profiles_role_guard
  before update on profiles
  for each row execute function prevent_role_escalation();
```

### 4.2 Row-level security

```sql
alter table profiles      enable row level security;
alter table reports       enable row level security;
alter table assignments   enable row level security;
alter table report_events enable row level security;

-- profiles ─────────────────────────────────────────────
create policy profiles_read_self   on profiles for select using (id = auth.uid());
create policy profiles_read_admin  on profiles for select using (current_role_name() = 'admin');
create policy profiles_read_crew   on profiles for select
  using (current_role_name() = 'responder' and role in ('responder','admin'));
create policy profiles_update_self on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all   on profiles for all
  using (current_role_name() = 'admin') with check (current_role_name() = 'admin');

-- reports ──────────────────────────────────────────────
create policy reports_insert_own on reports for insert
  with check (reporter_id = auth.uid() and status = 'new');

create policy reports_read_own on reports for select using (reporter_id = auth.uid());

create policy reports_read_assigned on reports for select using (
  current_role_name() = 'responder'
  and exists (select 1 from assignments a
              where a.report_id = reports.id
                and a.responder_id = auth.uid()
                and a.status <> 'cancelled')
);

create policy reports_admin_all on reports for all
  using (current_role_name() = 'admin') with check (current_role_name() = 'admin');

-- assignments ──────────────────────────────────────────
create policy assignments_read_own on assignments for select using (responder_id = auth.uid());
create policy assignments_read_reporter on assignments for select using (
  exists (select 1 from reports r where r.id = assignments.report_id and r.reporter_id = auth.uid())
);
create policy assignments_admin_all on assignments for all
  using (current_role_name() = 'admin') with check (current_role_name() = 'admin');

-- responders may accept/decline/progress only their own assignment
create policy assignments_responder_update on assignments for update
  using (responder_id = auth.uid())
  with check (responder_id = auth.uid());

-- report_events ────────────────────────────────────────
create policy events_read on report_events for select using (
  current_role_name() = 'admin'
  or exists (select 1 from reports r where r.id = report_events.report_id and r.reporter_id = auth.uid())
  or exists (select 1 from assignments a
             where a.report_id = report_events.report_id and a.responder_id = auth.uid())
);
create policy events_insert on report_events for insert with check (
  author_id = auth.uid() and (
    current_role_name() = 'admin'
    or exists (select 1 from reports r where r.id = report_id and r.reporter_id = auth.uid())
    or exists (select 1 from assignments a
               where a.report_id = report_events.report_id and a.responder_id = auth.uid())
  )
);
```

### 4.3 Status transitions via RPC, not raw updates

Responders must not be able to set `priority`, reassign jobs, or edit the reporter's text. Enforce that with `security definer` functions instead of broad UPDATE policies:

```sql
-- Responder accepts a job.
create or replace function accept_assignment(p_assignment uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update assignments
     set status = 'accepted', accepted_at = now()
   where id = p_assignment and responder_id = auth.uid() and status = 'assigned';
  if not found then raise exception 'assignment not available'; end if;

  update reports r set status = 'in_progress', updated_at = now()
   from assignments a
  where a.id = p_assignment and r.id = a.report_id;
end $$;

-- Responder completes a job.
create or replace function complete_assignment(p_assignment uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_report uuid;
begin
  update assignments
     set status = 'completed', completed_at = now(), note = coalesce(p_note, note)
   where id = p_assignment and responder_id = auth.uid() and status in ('accepted','in_progress')
  returning report_id into v_report;

  if v_report is null then raise exception 'assignment not completable'; end if;

  update reports set status = 'resolved', resolved_at = now(), updated_at = now()
   where id = v_report;

  insert into report_events (report_id, author_id, kind, message)
  values (v_report, auth.uid(), 'status', 'Job completed');
end $$;
```

**Note:** `security definer` functions bypass RLS, so each one must re-check `auth.uid()` and the allowed current state — as above. Revoke `execute` from `anon` on all of them.

### 4.4 Storage

```sql
-- Private bucket; photos are only reachable through signed URLs.
insert into storage.buckets (id, name, public) values ('report-photos', 'report-photos', false);

create policy photos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'report-photos');

create policy photos_read on storage.objects for select to authenticated
  using (
    bucket_id = 'report-photos' and (
      current_role_name() = 'admin'
      or exists (select 1 from reports r
                 where r.photo_path = storage.objects.name and r.reporter_id = auth.uid())
      or exists (select 1 from assignments a join reports r on r.id = a.report_id
                 where r.photo_path = storage.objects.name and a.responder_id = auth.uid())
    )
  );
```

Client compresses to ~1280px / quality 0.7 before upload. 1 GB then holds roughly 8,000–10,000 photos. Add a scheduled job to delete photos older than 90 days once reports are resolved (retention policy below).

---

## 5. Core flows

### Consumer
1. Opens URL → installs PWA (optional) → signs up with email (magic link or password).
2. Taps **Report**: picks type (Water / Electricity / Fire), adds description, photo, and location (GPS auto-fill, or drag a pin, or type an address).
3. Fire is flagged `critical` + `is_emergency` and shows a "call emergency services" notice — the app is a work-order system, not a replacement for 911/fire dispatch.
4. Sees a ticket number and live status. Gets a push notification when assigned / in progress / resolved.
5. Can comment and add photos to their own report.

### Admin
1. Live queue (Supabase Realtime) sorted by priority then age, with SLA timer badges.
2. Map view with clustered pins, colour-coded by type/status.
3. Triage: confirm type, set priority, merge duplicates, mark invalid.
4. Assign to a responder filtered by skill/zone/current load. Bulk-assign for area-wide outages.
5. Dashboard: open vs resolved, median time-to-assign, median time-to-resolve, per-zone breakdown, responder leaderboard.
6. Users: invite responders, deactivate accounts, change roles.

### Responder
1. Signs in on phone (invited account).
2. Job list: new assignments, accepted, in progress. Each card shows type, address, distance, reporter note, photo.
3. Accept → navigation via `geo:` / Google Maps deep link → "On my way" → "Start work" → "Complete" with a completion photo and note.
4. Offline: queue status changes in IndexedDB and sync when back online (common during outages).
5. Declines go back to the admin queue with a reason.

### SLA escalation (Edge Function on a schedule)
- `new` for > 15 min → notify admins.
- `assigned` not accepted in 30 min → reassign suggestion.
- `in_progress` > 8 h → flag.
- Daily digest email to admins at 08:00.

---

## 6. What's free, and where the limits are

| Service | Free tier (verify before launch — vendors change these) | Limit that will bite you | Mitigation |
|---|---|---|---|
| Supabase | 2 projects, ~500 MB DB, 1 GB storage, 5 GB egress, 50k MAU, Realtime, Edge Functions | Project **pauses after ~7 days of inactivity**; no daily backups | `cron-job.org` ping every 3 days; weekly `pg_dump` via GitHub Action |
| Cloudflare Pages | Unlimited requests/bandwidth, 500 builds/month, free HTTPS + subdomain | Build minutes; no server runtime | Static SPA + Supabase client; use Pages Functions only if needed |
| OneSignal | ~10k subscribers, unlimited notifications | Per-subscriber limits on advanced features | Fine for a city/utility scale; web-push fallback |
| Resend | ~3,000 emails/month, 100/day | Daily cap | Only used for auth/invites; push is primary |
| Leaflet + OSM | Free | OSM tile usage policy: no heavy bulk use | Cache tiles, or switch to MapTiler free tier (100k tiles/mo) if traffic grows |
| GitHub | Unlimited private repos, 2,000 Actions min/month | Minutes | Plenty for CI + backups |
| Sentry | 5k errors/month | — | Fine |
| UptimeRobot / cron-job.org | Free monitors/pings | — | — |
| Expo EAS (optional native) | Limited free builds/month | iOS builds need Apple dev account | Stay PWA-first; Android APK sideload is free |
| Domain | `*.pages.dev` free | Custom domain costs | Buy later if needed |

**Total: $0/month.** Realistic ceiling: a few thousand reports/month and a few hundred responders before you'd want Supabase Pro (~$25/mo) for backups and no pausing.

**Honest caveats**
- Free tiers have no SLA. For a service people depend on during emergencies, plan a paid upgrade or self-host once it's live. A $5/mo VPS running PocketBase or Supabase self-hosted is the cheap escape hatch.
- Supabase pausing is the biggest operational risk — automate the keep-alive and document how to un-pause.
- Free email deliverability is mediocre. If sign-in emails get lost, move to a custom domain + Resend/Postmark.

---

## 7. Non-code things you actually need

These are the parts that decide whether the system works, more than the stack:

1. **Who is a responder?** Utility crews, municipal workers, or volunteers? Define verification (employee ID, phone call, invite only) and who can revoke access.
2. **Who triages 24/7?** A report queue with no one watching is worse than no app. Define shifts, an on-call rotation, and a fallback phone number.
3. **SLA targets** per type and priority (e.g. fire → immediate escalation to fire service; water/electricity → 4 h response, 24 h restore). Encode them in the escalation function.
4. **Duplicate and false reports.** Same burst pipe gets 40 reports. Add a "nearby open reports" check (PostGIS `ST_DWithin`, free) and let admins merge. Rate-limit reports per user (e.g. 10/day).
5. **Emergency disclaimer.** Fire reports must tell users to call emergency services first. Put it on the report form and in the confirmation screen.
6. **Privacy & consent.** You're collecting location, photos, and phone numbers. Publish a short privacy notice, get consent at signup, restrict reporter contact to assigned responders + admins, and set retention (e.g. delete photos 90 days after resolution, anonymize reports after 1 year).
7. **Language & accessibility.** Low-literacy and low-bandwidth users: icon-first report types, big tap targets, local language, works on 3G, < 300 KB initial JS if possible.
8. **Fallback channel.** Not everyone has a smartphone. Keep a phone hotline and/or SMS shortcode; a WhatsApp Business number is free to receive. Africa's Talking / Twilio SMS is paid, so budget it only if needed.
9. **Abuse handling.** Ban/mute accounts, hide reporter identity from responders until assignment, log every status change (the `report_events` table is your audit trail).
10. **Data ownership.** Decide who owns the data (municipality vs. operator) and export it (`pg_dump` + CSV export) so you're not locked in.

---

## 8. Build roadmap

**Done so far**
- Phase 0/1 database: migrations `0001`–`0010`, RLS, triggers, RPCs, storage,
  realtime, health endpoint.
- Admin web console: login, dashboard, reports list + detail drawer (assign,
  unassign, triage, timeline), users list (role changes, activate/deactivate).
  Admin-only guard plus RLS. Default superadmin `admin` / `admin` via
  `scripts/create-admin.mjs`.
- Still open: consumer and responder mobile flows, PWA offline, push, maps.

**Phase 0 — 1 day: accounts & skeleton**
- Supabase project, Cloudflare Pages project, GitHub repo.
- Vite + React + TS + Tailwind + shadcn/ui + `@supabase/supabase-js`.
- Auth pages, protected routes by role, app shell with bottom nav (mobile) / sidebar (desktop).

**Phase 1 — week 1: the core loop**
- Schema + RLS + triggers + RPCs above.
- Consumer: report form with photo + location, "my reports" list with status.
- Admin: report table, detail drawer, assign responder.
- Responder: job list, accept, complete.
- Realtime on the admin queue.

**Phase 2 — week 2: make it usable**
- Map view (Leaflet clusters), filters, SLA timers.
- Push notifications (OneSignal), email invites.
- Photo compression, offline queue for responders, PWA manifest + service worker.
- Admin user management, duplicate merge, dashboard metrics.

**Phase 3 — hardening**
- Rate limiting, input validation (zod), RLS tests (pgTAP or a test user per role).
- Sentry, uptime monitoring, weekly backup Action, keep-alive cron.
- Privacy notice, terms, emergency disclaimer, retention job.
- Load test with 100 concurrent report submissions.

**Phase 4 — optional**
- Expo app if native push/background location is needed.
- PostGIS for "reports near me" and zone assignment.
- SMS/WhatsApp intake, IVR hotline.
- Multi-tenant (several utilities) if this becomes a product.

---

## 9. Tooling list (all free)

- **Editor:** VS Code
- **Repo/CI:** GitHub + GitHub Actions
- **Package manager:** pnpm
- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, React Hook Form + zod, React Router
- **Maps:** Leaflet, react-leaflet, leaflet.markercluster
- **Charts:** Recharts
- **Backend:** Supabase CLI, `supabase-js`, Edge Functions (Deno)
- **Testing:** Vitest, Playwright, pgTAP for RLS
- **Quality:** ESLint, Prettier, TypeScript strict
- **Observability:** Sentry (free), UptimeRobot, Cloudflare Web Analytics
- **Design:** Figma free, Lucide icons, Unsplash/undraw for placeholders
- **Docs:** this file + a README with run/deploy/backup instructions

---

## 10. Alternative stacks (if you'd rather not use Supabase)

| Stack | Free? | Trade-off |
|---|---|---|
| **Firebase** (Firestore + Auth + Hosting + FCM) | Yes (Spark) | No SQL/joins, rules language instead of RLS, Cloud Functions need the paid Blaze plan |
| **Cloudflare** (Workers + D1 + R2 + Pages) | Yes, commercial-friendly | You build auth yourself (or add Clerk free tier); more wiring |
| **PocketBase on a free/cheap VPS** | ~$0–5/mo | Single binary, real SQLite, built-in auth/realtime/admin UI; you own backups and uptime |
| **Appwrite Cloud free** | Yes | Similar to Supabase but smaller free DB and less mature RLS model |
| **Django + Postgres on Railway/Render free** | Sleeps after inactivity | Classic and solid, but free tiers sleep and are not great for a live queue |

**Recommendation stands:** Supabase + Cloudflare Pages + PWA.

---

## 11. Decisions to confirm before building

1. **Geography and connectivity** — is this urban with reliable 4G, or rural/low-bandwidth? (Changes offline and SMS priorities.)
2. **Who operates it** — municipality, utility company, or NGO? (Affects Vercel-vs-Cloudflare, data ownership, and whether "free" is acceptable long-term.)
3. **Emergency handling** — does a fire report page an actual fire service, or only notify internal staff? (If the former, you need an integration and a legal review.)
4. **Identity** — is email realistic for your users, or must it be phone-number login? (Phone OTP needs a paid SMS provider; email/magic-link is free.)
5. **Scale** — expected reports/day and number of responders. Under ~1,000/day the free tier is comfortable.
