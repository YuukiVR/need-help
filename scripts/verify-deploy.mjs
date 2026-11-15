#!/usr/bin/env node
/**
 * Check a Supabase project after `supabase db push`.
 *
 *   node --env-file=.env.admin scripts/verify-deploy.mjs
 *
 * Required env (see .env.admin.example):
 *   SUPABASE_URL                 https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    secret key — server only
 *
 * Optional:
 *   SUPABASE_ANON_KEY            publishable key, enables the RLS smoke test
 *
 * Exit code 0 = everything passed, 1 = at least one check failed.
 */

const url = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1$/i, '')
  .replace(/\/+$/, '')
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
const anon = process.env.SUPABASE_ANON_KEY

if (!url || !secret) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Fill them in .env.admin, then run:\n' +
      '  node --env-file=.env.admin scripts/verify-deploy.mjs',
  )
  process.exit(1)
}

const results = []

function record(name, ok, detail) {
  results.push({ name, ok, detail })
}

async function request(path, key = secret) {
  const res = await fetch(`${url}${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: res.status, body }
}

function report() {
  const width = Math.max(...results.map((item) => item.name.length))
  console.log('')
  for (const item of results) {
    const mark = item.ok ? 'PASS' : 'FAIL'
    console.log(`${mark}  ${item.name.padEnd(width)}  ${item.detail ?? ''}`)
  }

  const failed = results.filter((item) => !item.ok)
  console.log('')
  if (failed.length === 0) {
    console.log(`All ${results.length} checks passed.`)
    process.exitCode = 0
    return
  }

  console.log(`${failed.length} of ${results.length} checks failed.`)
  const rest = results.find((item) => item.name === 'REST API reachable')
  if (rest && !rest.ok) {
    console.log(
      'The API did not respond. Check SUPABASE_URL and the secret key, and make\n' +
        'sure the project is not paused (free projects pause after ~7 idle days).',
    )
  } else {
    console.log('Most failures mean the migrations were not pushed: supabase db push')
  }
  process.exitCode = 1
}

async function main() {
  console.log(`Checking ${url}`)

  let health
  try {
    health = await request('/rest/v1/health?select=ok')
  } catch (error) {
    record('REST API reachable', false, error?.message || String(error))
    report()
    return
  }

  record(
    'REST API reachable',
    health.status === 200 || health.status === 404,
    health.status === 200
      ? 'HTTP 200'
      : health.status === 404
        ? 'reachable, schema not applied'
        : `HTTP ${health.status} — check the URL and secret key`,
  )

  if (health.status === 401 || health.status === 403) {
    report()
    return
  }

  const relations = ['profiles', 'reports', 'assignments', 'report_events', 'report_queue']
  for (const relation of relations) {
    const result = await request(`/rest/v1/${relation}?select=*&limit=1`)
    const missing = result.status === 404
    record(
      `table ${relation}`,
      result.status === 200,
      missing ? 'missing — run supabase db push' : `HTTP ${result.status}`,
    )
  }

  const buckets = await request('/storage/v1/bucket')
  const bucketNames = Array.isArray(buckets.body)
    ? buckets.body.map((bucket) => bucket.name ?? bucket.id)
    : []
  record(
    'storage bucket report-photos',
    bucketNames.includes('report-photos'),
    bucketNames.length > 0
      ? `buckets: ${bucketNames.join(', ')}`
      : `HTTP ${buckets.status} — run supabase db push`,
  )

  const users = await request('/auth/v1/admin/users?page=1&per_page=200')
  const userList = users.body?.users ?? []
  const adminUser = userList.find(
    (user) => (user.email ?? '').toLowerCase() === 'admin@need-help.local',
  )
  record(
    'auth user admin@need-help.local',
    Boolean(adminUser),
    adminUser
      ? `confirmed: ${Boolean(adminUser.email_confirmed_at)}`
      : 'missing — run scripts/create-admin.mjs',
  )

  const profile = await request(
    '/rest/v1/profiles?email=eq.admin%40need-help.local&select=id,email,role,is_active',
  )
  const profileRow = Array.isArray(profile.body) ? profile.body[0] : null
  record(
    'profile is an active admin',
    profileRow?.role === 'admin' && profileRow?.is_active === true,
    profileRow ? `role=${profileRow.role} active=${profileRow.is_active}` : 'no profile row',
  )

  if (anon) {
    for (const relation of ['profiles', 'reports']) {
      const result = await request(`/rest/v1/${relation}?select=id&limit=5`, anon)
      const leaked = Array.isArray(result.body) && result.body.length > 0
      record(
        `RLS blocks anonymous ${relation}`,
        !leaked,
        leaked
          ? `LEAK: ${result.body.length} rows visible without a session`
          : `HTTP ${result.status}, 0 rows`,
      )
    }
  } else {
    console.log('Skipping RLS smoke test (no SUPABASE_ANON_KEY).')
  }

  report()
}

main().catch((error) => {
  console.error(`\nFailed: ${error?.message || String(error)}\n`)
  process.exit(1)
})
