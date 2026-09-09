import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

// redirect de la google /auth/callback?token=<jwt>
export default function AuthCallbackPage() {
  const [params] = useSearchParams()
  const { setUser } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const token = params.get('token')
    if (!token) { navigate('/login?error=no_token'); return }

    localStorage.setItem('iot_token', token)

    api.getMe()
      .then(user => {
        setUser(user)
        navigate('/', { replace: true })
      })
      .catch(() => {
        localStorage.removeItem('iot_token')
        navigate('/login?error=oauth_failed')
      })
  }, [])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <span className="spinner" style={{ width: 36, height: 36, margin: '0 auto 16px' }} />
        <div style={{ color: 'var(--text2)' }}>Se finalizeaza autentificarea...</div>
      </div>
    </div>
  )
}
