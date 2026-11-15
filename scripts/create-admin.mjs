#!/usr/bin/env node
/**
 * Create (or reset) the default superadmin account.
 *
 *   node --env-file=.env.admin scripts/create-admin.mjs
 *
 * Required env:
 *   SUPABASE_URL                https://<ref>.supabase.co  (or http://127.0.0.1:54321)
 *   SUPABASE_SERVICE_ROLE_KEY   service_role key — never ship this to the browser
 *
 * Optional env:
 *   ADMIN_USERNAME   default: admin
 *   ADMIN_PASSWORD   default: admin
 *   ADMIN_NAME       default: Super Admin
 *   USERNAME_DOMAIN  default: need-help.local
 *   ADMIN_EMAIL      default: <username>@<USERNAME_DOMAIN>
 *   SUPABASE_DB_URL  session-pooler connection string. Only needed when
 *                    ADMIN_PASSWORD is shorter than 6 characters: Auth refuses
 *                    such passwords, so the bcrypt hash is written directly.
 *
 * The app maps the username to an email, so "admin" signs in as
 * "admin@need-help.local". Keep USERNAME_DOMAIN in sync with
 * VITE_USERNAME_DOMAIN in .env.local.
 */
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1$/i, '')
  .replace(/\/+$/, '')
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Copy .env.admin.example to .env.admin, fill it in, then run:\n' +
      '  node --env-file=.env.admin scripts/create-admin.mjs',
  )
  process.exit(1)
}

const username = process.env.ADMIN_USERNAME || 'admin'
const password = process.env.ADMIN_PASSWORD || 'admin'
const domain = process.env.USERNAME_DOMAIN || 'need-help.local'
const email = (process.env.ADMIN_EMAIL || `${username}@${domain}`).toLowerCase()
const fullName = process.env.ADMIN_NAME || 'Super Admin'
const dbUrl = process.env.SUPABASE_DB_URL

// GoTrue rejects passwords shorter than 6 characters on create/update, but it
// does not enforce that on sign-in. So a short password is set as a bcrypt
// hash straight into auth.users (that is what Supabase itself stores).
const shortPassword = password.length < 6
const apiPassword = shortPassword ? `bootstrap-${randomUUID()}` : password

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function findUserByEmail(target) {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error

    const found = data.users.find((user) => user.email?.toLowerCase() === target)
    if (found) return found
    if (data.users.length < 200) return null
  }
  return null
}

async function writePasswordHash(userId, plain) {
  if (!dbUrl) {
    throw new Error(
      `ADMIN_PASSWORD "${plain}" is shorter than the 6 characters Supabase Auth accepts.\n` +
        'Add SUPABASE_DB_URL (Project Settings → Database → Connection string →\n' +
        'Session pooler) to .env.admin so the hash can be written directly, or\n' +
        'pick a password of 6+ characters.',
    )
  }

  const { default: pg } = await import('pg')
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()
  try {
    const result = await client.query(
      `update auth.users
          set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')),
              email_confirmed_at = coalesce(email_confirmed_at, now()),
              updated_at = now()
        where id = $1`,
      [userId, plain],
    )
    if (result.rowCount === 0) throw new Error(`No auth user with id ${userId}`)
  } finally {
    await client.end()
  }
}

async function main() {
  const existing = await findUserByEmail(email)
  let userId

  if (existing) {
    userId = existing.id
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: apiPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (error) throw error
    console.log(`Updated existing auth user: ${email}`)
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: apiPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (error) throw error
    userId = data.user.id
    console.log(`Created auth user: ${email}`)
  }

  if (shortPassword) {
    await writePasswordHash(userId, password)
    console.log('Wrote the short password as a bcrypt hash (Auth API minimum is 6).')
  }

  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      role: 'admin',
      is_active: true,
    },
    { onConflict: 'id' },
  )
  if (profileError) throw profileError

  console.log('')
  console.log('Superadmin ready.')
  console.log(`  username: ${username}`)
  console.log(`  email:    ${email}`)
  console.log(`  password: ${password}`)
  console.log('')
  console.log('Sign in at /login with the username (not the email).')
}

main().catch((error) => {
  const message = error?.message || String(error)
  console.error(`\nFailed: ${message}\n`)
  process.exitCode = 1
})
