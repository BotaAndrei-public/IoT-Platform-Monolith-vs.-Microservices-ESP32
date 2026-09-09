import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('iot_token')
    if (!token) { setLoading(false); return }

    api.getMe()
      .then(u => setUser(u))
      .catch(() => localStorage.removeItem('iot_token'))
      .finally(() => setLoading(false))
  }, [])

  const logout = async () => {
    await api.logout()
    localStorage.removeItem('iot_token')
    setUser(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
