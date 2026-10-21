import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import type { Role } from '../api/types'

export function RequireAuth({ allow }: { allow?: Role[] }) {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="route-guard">
        <span className="route-guard__pulse" aria-hidden="true" />
        <p className="route-guard__label">Verifying session</p>
      </div>
    )
  }

  if (status === 'anonymous' || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (allow && !allow.includes(user.role)) {
    // A logged-in user in the wrong seat goes to their own console.
    if (user.role === 'admin') return <Navigate to="/admin" replace />
    if (user.role === 'hospital') return <Navigate to="/hospital" replace />
    return <Navigate to="/donor" replace />
  }

  return <Outlet />
}

export function RequireGuest() {
  const { status, user } = useAuth()
  if (status === 'loading') {
    return (
      <div className="route-guard">
        <span className="route-guard__pulse" aria-hidden="true" />
      </div>
    )
  }
  if (user) {
    if (user.role === 'admin') return <Navigate to="/admin" replace />
    if (user.role === 'hospital') return <Navigate to="/hospital" replace />
    return <Navigate to="/donor" replace />
  }
  return <Outlet />
}
