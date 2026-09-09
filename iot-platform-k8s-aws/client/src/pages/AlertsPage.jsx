import { useState, useEffect } from 'react'
import { Bell, CheckCheck, AlertTriangle, Thermometer, Flame, Droplets } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../context/ToastContext'

const SENSOR_ICONS = {
  dht11_temp: Thermometer,
  dht11_humidity: Droplets,
  flame: Flame,
}

export default function AlertsPage() {
  const { toast } = useToast()
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('unread') // 'unread' | 'all'

  const load = async () => {
    try {
      const data = await api.getAlerts({
        unacknowledged: filter === 'unread' ? 'true' : 'false',
        limit: 100,
      })
      setAlerts(data)
    } catch (err) {
      toast(err.message, 'danger')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filter])

  const acknowledge = async (id) => {
    await api.acknowledgeAlert(id)
    setAlerts(a => a.map(x => x.id === id ? { ...x, acknowledged: 1 } : x))
    toast('Alerta marcata ca citita', 'success')
  }

  const acknowledgeAll = async () => {
    await api.acknowledgeAll()
    setAlerts(a => a.map(x => ({ ...x, acknowledged: 1 })))
    toast('Toate alertele marcate ca citite', 'success')
  }

  const unreadCount = alerts.filter(a => !a.acknowledged).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Alerte</h1>
          <p className="text-muted text-sm mt-1">
            {unreadCount > 0 ? `${unreadCount} alerte necitite` : 'Nicio alerta necitita'}
          </p>
        </div>
        <div className="flex gap-2">
          <select
            className="select"
            style={{ width: 'auto' }}
            value={filter}
            onChange={e => setFilter(e.target.value)}
          >
            <option value="unread">Necitite</option>
            <option value="all">Toate</option>
          </select>
          {unreadCount > 0 && (
            <button className="btn btn-ghost" onClick={acknowledgeAll}>
              <CheckCheck size={15} /> Marcheaza toate citite
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center" style={{ padding: 60 }}>
          <span className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      ) : alerts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
          <Bell size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
          <div style={{ fontSize: 15, color: 'var(--text2)' }}>Nicio alerta</div>
        </div>
      ) : (
        <div className="flex-col gap-2" style={{ display: 'flex' }}>
          {alerts.map(alert => {
            const Icon = SENSOR_ICONS[alert.sensor_type] || AlertTriangle
            return (
              <div key={alert.id} className="card card-sm" style={{
                display: 'flex', alignItems: 'center', gap: 14,
                opacity: alert.acknowledged ? 0.5 : 1,
                borderColor: alert.acknowledged ? undefined : 'var(--danger)',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: alert.acknowledged ? 'var(--bg3)' : '#3f0f0f',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon size={18} color={alert.acknowledged ? 'var(--text3)' : 'var(--danger)'} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{alert.message}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {alert.device_name} ·{' '}
                    {new Date(alert.timestamp * 1000).toLocaleString('ro-RO')}
                  </div>
                </div>

                {!alert.acknowledged && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => acknowledge(alert.id)}
                  >
                    <CheckCheck size={14} /> Citit
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
