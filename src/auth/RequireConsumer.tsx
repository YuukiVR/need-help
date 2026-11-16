import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { FullPageSpinner } from '../components/Spinner'

export function RequireConsumer() {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageSpinner label="Loading…" />

  if (!session) {
    return <Navigate to="/app/login" replace state={{ from: location.pathname }} />
  }

  if (profile?.role === 'admin') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
