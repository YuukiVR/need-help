import { createClient } from '@supabase/supabase-js'
import { DEMO_MODE } from './flags'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if ((!url || !anonKey) && !DEMO_MODE) {
  // Keep the app running so the login screen can explain the problem.
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local.',
  )
}

export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'missing-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
