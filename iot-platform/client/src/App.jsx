import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { ThemeProvider } from './context/ThemeContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import DashboardPage from './pages/DashboardPage'
import DevicesPage from './pages/DevicesPage'
import AlertsPage from './pages/AlertsPage'
import SettingsPage from './pages/SettingsPage'
import { api } from './lib/api'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center',
      justifyContent:'center', background:'var(--bg)' }}>
      <span className="spinner" style={{ width:36, height:36 }} />
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

function AppRoutes() {
  const { user } = useAuth()
  const [alertCount, setAlertCount] = useState(0)

  useEffect(() => {
    if (!user) return
    api.getAlerts({ unacknowledged: 'true', limit: 100 })
      .then(data => setAlertCount(data.length))
      .catch(() => {})
  }, [user])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/" element={
        <PrivateRoute>
          <Layout alertCount={alertCount} />
        </PrivateRoute>
      }>
        <Route index element={<DashboardPage />} />
        <Route path="devices"  element={<DevicesPage />} />
        <Route path="alerts"   element={<AlertsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
