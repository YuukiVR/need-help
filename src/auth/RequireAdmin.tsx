import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { FullPageSpinner } from '../components/Spinner'
import { AccessDenied } from '../components/AccessDenied'

export function RequireAdmin() {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageSpinner label="Checking access…" />

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!profile) {
    return (
      <AccessDenied
        title="Account not set up"
        description="Your login exists but no profile was found. Ask a superadmin to check the profiles table."
      />
    )
  }

  if (!profile.is_active) {
    return (
      <AccessDenied
        title="Account deactivated"
        description="This account has been deactivated. Contact a superadmin if you think this is a mistake."
      />
    )
  }

  if (profile.role !== 'admin') {
    return (
      <AccessDenied
        title="Administrator access only"
        description={`This console is for admins. Your account is a ${profile.role}. Use the mobile app for that role.`}
      />
    )
  }

  return <Outlet />
}
