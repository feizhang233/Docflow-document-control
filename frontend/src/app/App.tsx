import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { RequireAuth } from '../components/layout/RequireAuth'
import { LoginPage } from '../pages/LoginPage'

const DashboardPage = lazy(() => import('../pages/DashboardPage').then(module => ({ default: module.DashboardPage })))
const PackagesPage = lazy(() => import('../pages/PackagesPage').then(module => ({ default: module.PackagesPage })))
const SettingsPage = lazy(() => import('../pages/SettingsPage').then(module => ({ default: module.SettingsPage })))

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/documents" element={<Navigate to="/documents/week" replace />} />
          <Route path="/documents/:period" element={<PackagesPage kind="documents" />} />
          <Route path="/workflow" element={<PackagesPage kind="workflow" />} />
          <Route path="/transmittal" element={<PackagesPage kind="transmittal" />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
