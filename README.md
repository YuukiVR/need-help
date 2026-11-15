# Utility Outage Reporting System

Report no water / no electricity / fire; admins triage and assign responders;
responders repair and close the job.

- **Architecture & free-tier plan:** [`PLAN.md`](./PLAN.md)
- **Database:** [`supabase/README.md`](./supabase/README.md)
- **Going online:** [`DEPLOY.md`](./DEPLOY.md)

## Admin console (this repo)

One React + Vite + TypeScript app, deployed to Cloudflare Pages. Four pages,
all admin-only:

| Route | Page | What it does |
|---|---|---|
| `/login` | Login | username + password, rejects non-admin accounts |
| `/` | Dashboard | open / in-progress / emergency / resolved-today counts, needs-attention queue, type breakdown, recent reports |
| `/reports` | Reports | search, status/type/priority filters, pagination, detail drawer with photo, map link, assign/unassign, triage, timeline |
| `/users` | Users | search, role changes, activate/deactivate, self-protection |

Access control is enforced twice: the `RequireAdmin` guard keeps responders and
consumers out of the UI, and Postgres RLS keeps them out of the data even if
they call the API directly.

## Frontend quick start

```powershell
npm.cmd install
npm.cmd run dev        # http://127.0.0.1:5173
```

`npm` is blocked by PowerShell's execution policy on some machines; use
`npm.cmd` if you see a `npm.ps1 cannot be loaded` error.

### Preview without a database

`.env.local` ships with `VITE_DEMO_MODE=true`, so the app runs on sample data
(16 reports, 9 users) with no Supabase project. Sign in with `admin` / `admin`.

Demo mode is ignored by production builds (`import.meta.env.DEV` is false), so
a deployed site always talks to the real database. Remove the line from
`.env.local` when you connect Supabase.

### Connect Supabase

```powershell
Copy-Item .env.example .env.local   # then edit the two Supabase values
```

- `VITE_SUPABASE_URL` — `https://<ref>.supabase.co` (or `http://127.0.0.1:54321`)
- `VITE_SUPABASE_ANON_KEY` — the **publishable** key (`sb_publishable_…`) or
  legacy `anon` key. Never the secret key.
- `VITE_USERNAME_DOMAIN` — must match `USERNAME_DOMAIN` in `.env.admin`

Login is username-based, but Supabase Auth is email-based: `admin` is mapped to
`admin@need-help.local` before calling `signInWithPassword`.

## Default superadmin: `admin` / `admin`

Create it (or reset the password) with the secret-key script:

```powershell
Copy-Item .env.admin.example .env.admin   # fill in URL + secret key
node --env-file=.env.admin scripts/create-admin.mjs
```

Use the **secret** key (`sb_secret_…`, or legacy `service_role`) — it bypasses
RLS, so it stays on your machine and never goes to Cloudflare.

Then check the whole project in one go:

```powershell
node --env-file=.env.admin scripts/verify-deploy.mjs
```

It verifies the REST API, all five tables, the photo bucket, the admin user,
the admin profile, and that anonymous requests are blocked by RLS.

It is idempotent: it creates the Auth user if missing, confirms the email,
resets the password, and upserts `profiles` with `role = 'admin'` and
`is_active = true`. The same file works against a hosted project and against
`supabase start`.

If Supabase rejects the 5-character password (Auth enforces 6 by default), run
[`supabase/sql/force-admin-password.sql`](./supabase/sql/force-admin-password.sql)
in the SQL Editor. It writes a bcrypt hash of `admin` directly to `auth.users`;
sign-in itself does not enforce the minimum length.

> Change this password before real users depend on the system. Anyone who
> guesses `admin` gets the whole console.

## Scripts

| Command | Does |
|---|---|
| `npm.cmd run dev` | Vite dev server on port 5173 |
| `npm.cmd run build` | `tsc --noEmit` + production build into `dist/` |
| `npm.cmd run preview` | serve the built `dist/` |
| `node --env-file=.env.admin scripts/create-admin.mjs` | create/reset the superadmin |
| `node --env-file=.env.admin scripts/verify-deploy.mjs` | check tables, bucket, admin user, RLS |

## Database

```powershell
npm install -g supabase
supabase start
supabase db reset      # migrations 0001 → 0010
supabase status        # API URL + anon key for .env.local
```

Optional demo data: `supabase/seed.sql` (promotes the three example accounts and
inserts reports only when the table is empty).

No CLI? Paste [`supabase/sql/apply-all.sql`](./supabase/sql/apply-all.sql) into
the dashboard SQL Editor once — it contains all ten migrations in order. It is
regenerated with `node scripts/build-sql-bundle.mjs`.

## Roles

| Role | Client | Can |
|---|---|---|
| Admin | web | see all reports, triage, assign responders, manage users |
| Responder | mobile | see assigned jobs, accept, start, complete |
| Consumer | mobile | file reports, track status, comment |

Authorization is enforced by Postgres row-level security, not by the UI.
