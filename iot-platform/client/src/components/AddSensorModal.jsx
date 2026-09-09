import { useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../context/ToastContext'

// Pinii disponibili pe ESP32-C3 Super Mini
// GPIO disponibili: 0,1,2,3,4,5,6,7,8,9,10,20,21
const ESP32C3_PINS = [0,1,2,3,4,5,6,7,8,9,10,20,21]

const SENSOR_TYPES = [
  {
    value: 'dht11_temp',
    label: 'DHT11 - Temperatura',
    unit: '°C',
    description: 'Citeste temperatura de la senzor DHT11',
    protocol: 'OneWire (digital)',
  },
  {
    value: 'dht11_humidity',
    label: 'DHT11 - Umiditate',
    unit: '%',
    description: 'Citeste umiditatea de la senzor DHT11 (acelasi pin ca temperatura)',
    protocol: 'OneWire (digital)',
  },
  {
    value: 'flame',
    label: 'Senzor flacara (IR)',
    unit: 'bool',
    description: 'Detecteaza prezenta flacarii (output digital: 0=ok, 1=foc)',
    protocol: 'Digital input',
  },
  {
    value: 'relay',
    label: 'Relay / Output',
    unit: 'bool',
    description: 'Controleaza un relay - pompa, ventilator, bec, etc.',
    protocol: 'Digital output',
  },
]

const RELAY_MODES = [
  { value: 'onoff', label: 'On/Off simplu', description: 'Buton pornit/oprit' },
  { value: 'percent', label: 'Procent 0-100%', description: 'Slider pentru intensitate (PWM)' },
]

export function AddSensorModal({ deviceId, onClose, onCreated, existingSensors = [] }) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    type: 'dht11_temp',
    pin: '',
    alert_enabled: false,
    alert_min: '',
    alert_max: '',
    relay_label: '',
    relay_mode: 'onoff',
  })

  const selectedType = SENSOR_TYPES.find(t => t.value === form.type)
  const isRelay = form.type === 'relay'

  // Daca pinul este deja urilizat 
  const usedPins = existingSensors.map(s => s.pin)
  const pinConflict = form.pin !== '' && usedPins.includes(parseInt(form.pin))

  //tep. si umiditatea se pot citi pe un singur pin
  const dhtPins = existingSensors
    .filter(s => s.type === 'dht11_temp' || s.type === 'dht11_humidity')
    .map(s => s.pin)

  const handle = async (e) => {
    e.preventDefault()
    if (!form.name || form.pin === '') return
    setLoading(true)

    try {
      const body = {
        name: form.name,
        type: form.type,
        pin: parseInt(form.pin),
        unit: selectedType?.unit,
        alert_enabled: form.alert_enabled,
        alert_min: form.alert_enabled && form.alert_min !== '' ? parseFloat(form.alert_min) : null,
        alert_max: form.alert_enabled && form.alert_max !== '' ? parseFloat(form.alert_max) : null,
      }

      if (isRelay) {
        body.relay_config = {
          mode: form.relay_mode,
          label: form.relay_label || form.name,
        }
      }

      const sensor = await api.createSensor(deviceId, body)
      toast(`Senzor "${sensor.name}" adaugat!`, 'success')
      onCreated(sensor)
    } catch (err) {
      toast(err.message, 'danger')
    } finally {
      setLoading(false)
    }
  }

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="modal-title" style={{ margin: 0 }}>Adauga senzor</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={handle}>
          {/* Tip senzor */}
          <div className="form-group mb-3">
            <label className="label">Tip senzor</label>
            <select className="select" value={form.type} onChange={e => set('type', e.target.value)}>
              {SENSOR_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {selectedType && (
              <div className="text-xs text-muted mt-1">
                {selectedType.description} · <span style={{ color: 'var(--primary)' }}>{selectedType.protocol}</span>
              </div>
            )}
          </div>

          {/* Numele */}
          <div className="form-group mb-3">
            <label className="label">Nume afisat in dashboard</label>
            <input
              className="input"
              placeholder={isRelay ? 'ex: Pompa apa, Ventilator' : 'ex: Temp. Living, Fum Bucatarie'}
              value={form.name}
              onChange={e => set('name', e.target.value)}
              autoFocus
            />
          </div>

          {/* Selecteaza un pin */}
          <div className="form-group mb-3">
            <label className="label">Pin GPIO pe ESP32-C3</label>
            <select
              className="select"
              value={form.pin}
              onChange={e => set('pin', e.target.value)}
              style={{ borderColor: pinConflict ? 'var(--warning)' : undefined }}
            >
              <option value="">-- Selecteaza pin --</option>
              {ESP32C3_PINS.map(pin => {
                const used = usedPins.includes(pin)
                const isDht = dhtPins.includes(pin)
                return (
                  <option key={pin} value={pin}>
                    GPIO {pin}
                    {used && !isDht ? ' (folosit)' : ''}
                    {isDht && (form.type === 'dht11_temp' || form.type === 'dht11_humidity')
                      ? ' (DHT11 existent - OK)' : ''}
                  </option>
                )
              })}
            </select>
            {pinConflict && !(dhtPins.includes(parseInt(form.pin)) &&
              (form.type === 'dht11_temp' || form.type === 'dht11_humidity')) && (
              <div className="text-xs text-warning mt-1">
                Atentie: GPIO {form.pin} este deja folosit de un alt senzor
              </div>
            )}
            <div className="text-xs text-muted mt-1">
              Pinii disponibili pe ESP32-C3 Super Mini: GPIO 0-10, 20, 21
            </div>
          </div>

          {/* Config relee, nu merge prea bine*/}
          {isRelay && (
            <div className="card card-sm mb-3" style={{ background: 'var(--bg3)' }}>
              <div className="text-sm font-medium mb-3" style={{ color: 'var(--text2)' }}>
                Configurare relay
              </div>
              <div className="form-group mb-3">
                <label className="label">Eticheta buton in dashboard</label>
                <input
                  className="input"
                  placeholder="ex: Pompa apa, Fan 1, Lumina terasa"
                  value={form.relay_label}
                  onChange={e => set('relay_label', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="label">Mod control</label>
                {RELAY_MODES.map(m => (
                  <label key={m.value} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                    background: form.relay_mode === m.value ? 'var(--bg2)' : 'transparent',
                    marginBottom: 4,
                  }}>
                    <input
                      type="radio"
                      name="relay_mode"
                      value={m.value}
                      checked={form.relay_mode === m.value}
                      onChange={() => set('relay_mode', m.value)}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{m.label}</div>
                      <div className="text-xs text-muted">{m.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Alertele pentu senzori, nu se aplica la relee */}
          {!isRelay && (
            <div className="card card-sm mb-3" style={{ background: 'var(--bg3)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium">Alerte prag</div>
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
                <div className="flex gap-3">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="label">Min ({selectedType?.unit})</label>
                    <input
                      className="input"
                      type="number"
                      placeholder="ex: 0"
                      value={form.alert_min}
                      onChange={e => set('alert_min', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="label">Max ({selectedType?.unit})</label>
                    <input
                      className="input"
                      type="number"
                      placeholder="ex: 35"
                      value={form.alert_max}
                      onChange={e => set('alert_max', e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 justify-between mt-4">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Anuleaza</button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !form.name || form.pin === ''}
            >
              {loading ? <span className="spinner" /> : null}
              Adauga senzor
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
