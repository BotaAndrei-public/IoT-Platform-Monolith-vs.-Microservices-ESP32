import { useState, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Cpu, Bell, Settings, LogOut, ChevronDown, Sun, Moon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

export default function Layout({ alertCount = 0 }) {
  const { user, logout } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [serverOk, setServerOk] = useState(false)

  useEffect(() => {
    const check = async () => {
      try { const r = await fetch('/health'); setServerOk(r.ok) }
      catch { setServerOk(false) }
    }
    check()
    const t = setInterval(check, 15000)
    return () => clearInterval(t)
  }, [])

 
  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('#user-menu-btn')) setShowUserMenu(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  const navItems = [
    { to: '/',         icon: <LayoutDashboard size={16} />, label: 'Dashboard' },
    { to: '/devices',  icon: <Cpu size={16} />,             label: 'Devices'   },
    { to: '/alerts',   icon: <Bell size={16} />,            label: 'Alerts', badge: alertCount },
    { to: '/settings', icon: <Settings size={16} />,        label: 'Settings'  },
  ]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
   
      <aside style={{
        width: 220, flexShrink: 0,
        background: 'var(--bg2)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
      }}>
        
        <div style={{
          padding: '16px 16px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div className="flex items-center gap-2">
            <div style={{
              width: 30, height: 30, borderRadius: 7,
              background: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Cpu size={16} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>IoT Platform</div>
              <div className="flex items-center gap-1" style={{ marginTop: 1 }}>
                <div className={`dot ${serverOk ? 'dot-online' : 'dot-offline'}`}
                  style={{ width: 6, height: 6 }} />
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                  {serverOk ? 'online' : 'offline'}
                </span>
              </div>
            </div>
          </div>

          {/* Selectare tema */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: 'var(--bg3)', border: '1px solid var(--border)',
              cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              color: 'var(--text2)', transition: 'all 0.15s',
            }}
          >
            {theme === 'dark'
              ? <Sun size={13} />
              : <Moon size={13} />}
          </button>
        </div>

        {/* navigare */}
        <nav style={{ padding: '10px 8px', flex: 1 }}>
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 7, textDecoration: 'none',
                fontSize: 13, fontWeight: 500, marginBottom: 2,
                background: isActive ? 'var(--primary-dim)' : 'transparent',
                color: isActive ? 'var(--primary)' : 'var(--text2)',
                transition: 'all 0.15s',
              })}>
              {item.icon}
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge > 0 && (
                <span style={{
                  background: 'var(--danger)', color: '#fff',
                  borderRadius: 10, padding: '1px 6px',
                  fontSize: 10, fontWeight: 700,
                }}>{item.badge}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* meniu userului */}
        {user && (
          <div style={{ padding: '10px', borderTop: '1px solid var(--border)', position: 'relative' }}>
            <button
              id="user-menu-btn"
              onClick={(e) => { e.stopPropagation(); setShowUserMenu(v => !v) }}
              style={{
                width: '100%', background: 'var(--bg3)',
                border: '1px solid var(--border)', borderRadius: 8,
                padding: '8px 10px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {user.avatar
                ? <img src={user.avatar} style={{ width: 26, height: 26, borderRadius: '50%' }} alt="" />
                : <div style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: 'var(--primary)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, color: '#fff', fontWeight: 700,
                  }}>{user.name?.[0]}</div>
              }
              <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.email}
                </div>
              </div>
              <ChevronDown size={12} color="var(--text3)" />
            </button>

            {showUserMenu && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 10, right: 10, marginBottom: 4,
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow)',
                zIndex: 50,
              }}>
                <button onClick={logout} style={{
                  width: '100%', padding: '10px 14px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                  color: 'var(--danger)', fontSize: 13,
                }}>
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      <main style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
        <Outlet />
      </main>
    </div>
  )
}
