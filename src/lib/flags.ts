import type { Profile } from './types'

/**
 * Dev-only demo switch. `import.meta.env.DEV` is false in production builds, so
 * the flag (and the demo data behind it) can never turn on for real users.
 */
export const DEMO_MODE = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true'

/** The account you sign in with in demo mode (admin / admin). */
export const DEMO_ADMIN: Profile = {
  id: 'demo-admin',
  full_name: 'Super Admin',
  phone: '+1 555 0100',
  email: 'admin@need-help.local',
  role: 'admin',
  zone: 'Citywide',
  is_active: true,
  created_at: new Date(Date.now() - 60 * 24 * 120 * 60_000).toISOString(),
}
