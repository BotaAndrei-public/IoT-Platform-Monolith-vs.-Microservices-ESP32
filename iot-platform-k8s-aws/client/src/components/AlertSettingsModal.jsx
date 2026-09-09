import { useState } from 'react'
import { X, Bell, BellOff } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../context/ToastContext'

export function AlertSettingsModal({ device, sensor, onClose, onUpdated }) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    alert_enabled:          !!sensor.alert_enabled,
    alert_min:              sensor.alert_min ?? '',
    alert_max:              sensor.alert_max ?? '',
    alert_cooldown_minutes: sensor.alert_cooldown_minutes ?? 10,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setLoading(true)
    try {
      const updated = await api.updateSensorAlert(device.id, sensor.id, {
        alert_enabled:          form.alert_enabled,
        alert_min:              form.alert_enabled && form.alert_min !== ''
                                  ? parseFloat(form.alert_min) : null,
        alert_max:              form.alert_enabled && form.alert_max !== ''
                                  ? parseFloat(form.alert_max) : null,
        alert_cooldown_minutes: parseInt(form.alert_cooldown_minutes) || 10,
      })
      toast('Alert settings saved', 'success')
      onUpdated(updated)
      onClose()
    } catch (err) {
      toast(err.message, 'danger')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 400 }}>

        {/* TITLUE */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {form.alert_enabled
              ? <Bell size={17} color="var(--warning)" />
              : <BellOff size={17} color="var(--text3)" />}
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Alert Settings</div>
              <div className="text-xs text-muted">{sensor.name}</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        {sensor.type === 'relay' ? (
          <div style={{
            padding: '12px 14px', borderRadius: 8, fontSize: 13,
            background: 'var(--bg3)', color: 'var(--text2)',
          }}>
            Relay sensors don't support alerts.
          </div>
        ) : (
          <>
            {/* Buton pt pornit/oprit  */}
            <div className="flex items-center justify-between mb-4" style={{
              padding: '12px 14px', background: 'var(--bg3)',
              borderRadius: 8, border: '1px solid var(--border)',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Alerts enabled</div>
                <div className="text-xs text-muted mt-1">
                  {form.alert_enabled
                    ? 'Notifications sent when thresholds are exceeded'
                    : 'No notifications will be sent'}
                </div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={form.alert_enabled}
                  onChange={e => set('alert_enabled', e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            {form.alert_enabled && (
              <>
                {/*Setari minim maxim*/}
                <div className="flex gap-3 mb-4">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="label">Min ({sensor.unit})</label>
                    <input
                      className="input" type="number"
                      placeholder="e.g. 5"
                      value={form.alert_min}
                      onChange={e => set('alert_min', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="label">Max ({sensor.unit})</label>
                    <input
                      className="input" type="number"
                      placeholder="e.g. 35"
                      value={form.alert_max}
                      onChange={e => set('alert_max', e.target.value)}
                    />
                  </div>
                </div>

                {/* SENZ FOC */}
                {sensor.type === 'flame' && (
                  <div style={{
                    padding: '8px 12px', borderRadius: 7, fontSize: 12,
                    background: 'var(--warning-dim)', color: 'var(--warning)',
                    marginBottom: 14,
                  }}>
                    💡 For flame sensor: set Max = 0.5 to alert when fire is detected (value = 1)
                  </div>
                )}

                {/* TIMP de asteptare */}
                <div className="form-group mb-4">
                  <label className="label">
                    Cooldown between alerts
                    <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>
                      — min time before repeating the same alert
                    </span>
                  </label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {[1, 5, 10, 30, 60].map(m => (
                      <button key={m}
                        onClick={() => set('alert_cooldown_minutes', m)}
                        className="btn btn-sm"
                        style={{
                          background: form.alert_cooldown_minutes === m
                            ? 'var(--primary)' : 'var(--bg3)',
                          color: form.alert_cooldown_minutes === m
                            ? '#fff' : 'var(--text2)',
                          border: '1px solid var(--border)',
                        }}>
                        {m < 60 ? `${m}m` : '1h'}
                      </button>
                    ))}
                    <input
                      className="input" type="number" min="1" max="1440"
                      value={form.alert_cooldown_minutes}
                      onChange={e => set('alert_cooldown_minutes', parseInt(e.target.value) || 10)}
                      style={{ width: 65 }}
                    />
                    <span className="text-xs text-muted">min</span>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <div className="flex gap-2 mt-2">
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </button>
          {sensor.type !== 'relay' && (
            <button className="btn btn-primary" style={{ flex: 1 }}
              onClick={save} disabled={loading}>
              {loading ? <span className="spinner" /> : null}
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
