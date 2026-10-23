import { Suspense, lazy, useEffect, useRef } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'

import { RequireAuth, RequireGuest } from './auth/Guards'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import NotFound from './pages/NotFound'

// The consoles are split out of the entry chunk: a visitor reading the home
// page never downloads the admin console's tables and charts, and vice versa.
const DonorHome = lazy(() => import('./pages/DonorHome'))
const DonorAlerts = lazy(() => import('./pages/DonorAlerts'))
const DonorHistory = lazy(() => import('./pages/DonorHistory'))
const DonorProfile = lazy(() => import('./pages/DonorProfile'))
const HospitalHome = lazy(() => import('./pages/HospitalHome'))
const HospitalRequests = lazy(() => import('./pages/HospitalRequests'))
const HospitalInventory = lazy(() => import('./pages/HospitalInventory'))
const HospitalActions = lazy(() => import('./pages/HospitalActions'))
const AdminConsole = lazy(() => import('./pages/AdminConsole'))

function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      <span className="route-fallback__mark" aria-hidden="true" />
      <span>Loading</span>
    </div>
  )
}

/**
 * Move focus to the main landmark after a client-side navigation.
 *
 * Without this, focus stays on a link that may no longer exist after the route
 * changes, so a keyboard or screen-reader user is dropped back at the top of
 * the document with no announcement. Skipped on first paint, where the browser
 * has already put focus somewhere sensible.
 */
function RouteFocus() {
  const { pathname } = useLocation()
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    document.getElementById('main')?.focus()
    window.scrollTo({ top: 0, left: 0 })
  }, [pathname])

  return null
}

export default function App() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <RouteFocus />

      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />

          <Route element={<RequireGuest />}>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>

          <Route element={<RequireAuth allow={['donor']} />}>
            <Route path="/donor" element={<DonorHome />} />
            <Route path="/donor/alerts" element={<DonorAlerts />} />
            <Route path="/donor/history" element={<DonorHistory />} />
            <Route path="/donor/profile" element={<DonorProfile />} />
          </Route>

          <Route element={<RequireAuth allow={['hospital']} />}>
            <Route path="/hospital" element={<HospitalHome />} />
            <Route path="/hospital/requests" element={<HospitalRequests />} />
            <Route path="/hospital/inventory" element={<HospitalInventory />} />
            <Route path="/hospital/actions" element={<HospitalActions />} />
          </Route>

          <Route element={<RequireAuth allow={['admin']} />}>
            <Route path="/admin" element={<AdminConsole />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  )
}
