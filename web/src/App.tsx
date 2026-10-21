import { Route, Routes } from 'react-router-dom'

import { RequireAuth, RequireGuest } from './auth/Guards'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import DonorHome from './pages/DonorHome'
import DonorAlerts from './pages/DonorAlerts'
import DonorHistory from './pages/DonorHistory'
import DonorProfile from './pages/DonorProfile'
import HospitalHome from './pages/HospitalHome'
import HospitalRequests from './pages/HospitalRequests'
import HospitalInventory from './pages/HospitalInventory'
import HospitalActions from './pages/HospitalActions'
import AdminConsole from './pages/AdminConsole'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
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
  )
}
