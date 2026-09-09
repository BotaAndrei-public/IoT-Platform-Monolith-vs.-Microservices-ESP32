import { Thermometer, Droplets, Flame, ToggleLeft, ToggleRight, Zap } from 'lucide-react'

// PostgreSQL da valori numerice ca string, trebuie convert intotdeauna
const toNum = (v) => (v === null || v === undefined) ? null : Number(v)

const SENSOR_META = {
  dht11_temp: {
    icon: Thermometer,
    color: '#f87171',
    label: 'Temperatura',
    format: (v) => {
      const n = toNum(v)
      return n !== null && !isNaN(n) ? `${n.toFixed(1)}°C` : '--'
    },
    getStatus: (v, min, max) => {
      const n = toNum(v)
      if (n === null) return 'normal'
      if (max !== null && n > Number(max)) return 'danger'
      if (min !== null && n < Number(min)) return 'warning'
      return 'normal'
    },
  },
  dht11_humidity: {
    icon: Droplets,
    color: '#60a5fa',
    label: 'Umiditate',
    format: (v) => {
      const n = toNum(v)
      return n !== null && !isNaN(n) ? `${n.toFixed(0)}%` : '--'
    },
    getStatus: (v, min, max) => {
      const n = toNum(v)
      if (n === null) return 'normal'
      if (max !== null && n > Number(max)) return 'danger'
      if (min !== null && n < Number(min)) return 'warning'
      return 'normal'
    },
  },
  flame: {
    icon: Flame,
    color: '#fb923c',
    label: 'Sensor flacara',
    format: (v) => (Number(v) === 1 ? 'FOC DETECTAT' : 'OK'),
    getStatus: (v) => (Number(v) === 1 ? 'danger' : 'normal'),
  },
  relay: {
    icon: Zap,
    color: '#a78bfa',
    label: 'Relay',
    format: (v) => (Number(v) === 1 ? 'ON' : 'OFF'),
    getStatus: () => 'normal',
  },
}

const STATUS_COLORS = {
  normal:  'var(--text)',
  danger:  'var(--danger)',
  warning: 'var(--warning)',
}

export function SensorCard({ sensor, latestValue, onRelayToggle }) {
  const meta    = SENSOR_META[sensor.type] || SENSOR_META.dht11_temp
  const Icon    = meta.icon
  const rawVal  = latestValue?.value ?? null
  const value   = toNum(rawVal)
  const status  = meta.getStatus(value, sensor.alert_min, sensor.alert_max)
  const isRelay = sensor.type === 'relay'
  const relayConfig = sensor.relay_config
    ? (typeof sensor.relay_config === 'string'
        ? JSON.parse(sensor.relay_config)
        : sensor.relay_config)
    : {}

  return (
    <div className="card" style={{
      borderColor: status !== 'normal' ? STATUS_COLORS[status] : undefined,
      transition: 'border-color 0.3s',
    }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `${meta.color}22`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={16} color={meta.color} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{sensor.name}</div>
            <div className="text-xs text-muted">GPIO {sensor.pin} · {meta.label}</div>
          </div>
        </div>
        {status !== 'normal' && (
          <span className={`badge ${status === 'danger' ? 'badge-flame' : 'badge-warning'}`}>
            {status === 'danger' ? 'ALERTA' : 'ATENTIE'}
          </span>
        )}
      </div>

      
      {!isRelay ? (
        <div style={{
          fontSize: 34, fontWeight: 700,
          color: STATUS_COLORS[status],
          letterSpacing: '-1px',
          margin: '14px 0 4px',
          transition: 'color 0.3s',
        }}>
          {meta.format(value)}
        </div>
      ) : (
        <RelayControl
          sensor={sensor}
          relayConfig={relayConfig}
          onToggle={onRelayToggle}
        />
      )}

      {latestValue?.recorded_at && (
        <div className="text-xs text-muted mt-1">
          {new Date(latestValue.recorded_at).toLocaleTimeString('ro-RO')}
        </div>
      )}

    
      {sensor.alert_enabled && !isRelay && (
        <div className="flex gap-3 mt-2 text-xs text-muted">
          {sensor.alert_min !== null && <span>Min: {sensor.alert_min}{sensor.unit}</span>}
          {sensor.alert_max !== null && <span>Max: {sensor.alert_max}{sensor.unit}</span>}
        </div>
      )}
    </div>
  )
}

function RelayControl({ sensor, relayConfig, onToggle }) {
  const mode  = relayConfig?.mode || 'onoff'
  const isOn  = Number(sensor.state) === 1
  const pct   = Number(sensor.percent) || 0
  const label = relayConfig?.label || sensor.name

  if (mode === 'percent') {
    return (
      <div style={{ margin: '12px 0 4px' }}>
        <div className="flex justify-between items-center mb-2">
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>{label}</span>
          <span style={{ fontWeight: 700, fontSize: 22, color: pct > 0 ? 'var(--success)' : 'var(--text3)' }}>
            {pct}%
          </span>
        </div>
        <input
          type="range" min="0" max="100" value={pct}
          onChange={(e) => onToggle(sensor.id, { percent: parseInt(e.target.value) })}
          style={{ width: '100%' }}
        />
        <div className="flex justify-between text-xs text-muted mt-1">
          <span>0%</span><span>100%</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ margin: '12px 0 4px' }}>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>{label}</div>
      <button
        onClick={() => onToggle(sensor.id, { state: isOn ? 0 : 1 })}
        className="btn"
        style={{
          width: '100%', justifyContent: 'center', gap: 8,
          background: isOn ? 'var(--success-dim)' : 'var(--bg3)',
          color: isOn ? 'var(--success)' : 'var(--text2)',
          border: `1px solid ${isOn ? 'var(--success)' : 'var(--border)'}`,
        }}
      >
        {isOn ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
        {isOn ? 'PORNIT' : 'OPRIT'}
      </button>
    </div>
  )
}
