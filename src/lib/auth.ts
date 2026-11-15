/**
 * The database uses Supabase Auth, which is email based. Admins sign in with
 * a username, so "admin" is mapped to "admin@<USERNAME_DOMAIN>".
 *
 * Keep this domain in sync with scripts/create-admin.mjs and
 * VITE_USERNAME_DOMAIN in .env.local.
 */
export const USERNAME_DOMAIN = import.meta.env.VITE_USERNAME_DOMAIN || 'need-help.local'

export function usernameToEmail(input: string): string {
  const value = input.trim().toLowerCase()
  if (!value) return ''
  return value.includes('@') ? value : `${value}@${USERNAME_DOMAIN}`
}

export function emailToUsername(email?: string | null): string {
  if (!email) return ''
  const value = email.toLowerCase()
  const suffix = `@${USERNAME_DOMAIN}`
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value
}
