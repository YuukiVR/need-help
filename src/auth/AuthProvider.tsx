import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { fetchProfile } from '../lib/api'
import { DEMO_ADMIN, DEMO_MODE } from '../lib/flags'
import type { Profile } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  demoMode: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
  demoSignIn: () => void
}

const AuthContext = createContext<AuthState | undefined>(undefined)

const DEMO_KEY = 'need-help:demo-signed-in'

function readDemoFlag(): boolean {
  try {
    return DEMO_MODE && window.sessionStorage.getItem(DEMO_KEY) === '1'
  } catch {
    return false
  }
}

function writeDemoFlag(value: boolean) {
  try {
    if (value) window.sessionStorage.setItem(DEMO_KEY, '1')
    else window.sessionStorage.removeItem(DEMO_KEY)
  } catch {
    // sessionStorage can be blocked; the demo still works without persistence.
  }
}

const DEMO_SESSION = {
  access_token: 'demo',
  refresh_token: 'demo',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: DEMO_ADMIN.id,
    email: DEMO_ADMIN.email,
    app_metadata: {},
    user_metadata: { full_name: DEMO_ADMIN.full_name },
    aud: 'authenticated',
    created_at: DEMO_ADMIN.created_at,
  },
} as unknown as Session

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [demoSignedIn, setDemoSignedIn] = useState(readDemoFlag)

  const loadProfile = useCallback(async (userId: string) => {
    try {
      setProfile(await fetchProfile(userId))
    } catch (error) {
      console.error('Could not load profile', error)
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    if (DEMO_MODE) return

    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      if (!data.session) setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user?.id

  useEffect(() => {
    if (DEMO_MODE || !userId) return
    let active = true
    setLoading(true)
    loadProfile(userId).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [userId, loadProfile])

  const refreshProfile = useCallback(async () => {
    if (DEMO_MODE || !userId) return
    await loadProfile(userId)
  }, [userId, loadProfile])

  const signOut = useCallback(async () => {
    if (DEMO_MODE) {
      writeDemoFlag(false)
      setDemoSignedIn(false)
      return
    }
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const demoSignIn = useCallback(() => {
    writeDemoFlag(true)
    setDemoSignedIn(true)
  }, [])

  const value: AuthState = DEMO_MODE
    ? {
        session: demoSignedIn ? DEMO_SESSION : null,
        profile: demoSignedIn ? DEMO_ADMIN : null,
        loading: false,
        demoMode: true,
        refreshProfile,
        signOut,
        demoSignIn,
      }
    : {
        session,
        profile,
        loading,
        demoMode: false,
        refreshProfile,
        signOut,
        demoSignIn,
      }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
