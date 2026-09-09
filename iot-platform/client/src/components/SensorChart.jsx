import { useState, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import { ro } from 'date-fns/locale'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceArea, Brush,
  ReferenceLine, Legend,
} from 'recharts'
import { ZoomIn, ZoomOut, RotateCcw, TrendingUp, TrendingDown, Minus } from 'lucide-react'

const INTERVALS = [
  { label: '1h',   value: '1h'  },
  { label: '6h',   value: '6h'  },
  { label: '24h',  value: '24h' },
  { label: '7d',   value: '7d'  },
  { label: '30d',  value: '30d' },
  { label: '1y',   value: '1y'  },
]


function formatBucket(bucket, granularity) {
  try {
    const d = typeof bucket === 'string' ? parseISO(bucket) : new Date(bucket)
    switch (granularity) {
      case 'minute': return format(d, 'HH:mm')
      case 'hour':   return format(d, 'HH:mm dd/MM')
      case 'day':    return format(d, 'dd MMM', { locale: ro })
      case 'month':  return format(d, 'MMM yyyy', { locale: ro })
      default:       return format(d, 'dd/MM HH:mm')
    }
  } catch { return bucket }
}


function CustomTooltip({ active, payload, label, granularity, unit }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload

  if (d?.is_gap) {
    return (
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--warning)',
        borderRadius: 8, padding: '10px 14px', fontSize: 12,
      }}>
        <div style={{ color: 'var(--warning)', fontWeight: 600, marginBottom: 4 }}>
          ⚠ Date lipsa
        </div>
        <div style={{ color: 'var(--text2)' }}>
          Gap: ~{d.gap_minutes} minute fara date
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
    }}>
      <div style={{ color: 'var(--text2)', marginBottom: 6 }}>
        {formatBucket(label, granularity)}
      </div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2" style={{ marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
          <span style={{ color: 'var(--text2)', textTransform: 'capitalize' }}>{p.name}:</span>
          <span style={{ fontWeight: 600, color: p.color }}>
            {p.value !== null ? `${p.value}${unit}` : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

export function SensorChart({ sensorData, color = '#6c7fff', onIntervalChange, interval, loading }) {
  const [refAreaLeft, setRefAreaLeft]   = useState(null)
  const [refAreaRight, setRefAreaRight] = useState(null)
  const [isDragging, setIsDragging]     = useState(false)
  const [zoomStack, setZoomStack]       = useState([])   
  const [zoomedData, setZoomedData]     = useState(null) 

  const { sensor_id, sensor_name, sensor_type, unit, data = [], granularity } = sensorData || {}
  const displayData = zoomedData ?? data

// Stat. rapide 
  const validData = displayData.filter(d => !d.is_gap && d.avg !== null)
  const avgValue  = validData.length
    ? (validData.reduce((s, d) => s + parseFloat(d.avg), 0) / validData.length).toFixed(1)
    : null
  const minValue = validData.length ? Math.min(...validData.map(d => parseFloat(d.min))) : null
  const maxValue = validData.length ? Math.max(...validData.map(d => parseFloat(d.max))) : null
  const gapCount  = displayData.filter(d => d.is_gap).length

  //Zoom cu mouse drag, nu prea merge 
  const onMouseDown = useCallback((e) => {
    if (!e?.activeLabel) return
    setRefAreaLeft(e.activeLabel)
    setIsDragging(true)
  }, [])

  const onMouseMove = useCallback((e) => {
    if (!isDragging || !e?.activeLabel) return
    setRefAreaRight(e.activeLabel)
  }, [isDragging])

  const onMouseUp = useCallback(() => {
    setIsDragging(false)
    if (!refAreaLeft || !refAreaRight) {
      setRefAreaLeft(null); setRefAreaRight(null); return
    }

    let left  = refAreaLeft
    let right = refAreaRight
    if (left > right) [left, right] = [right, left]

    const sliced = displayData.filter(d => d.bucket >= left && d.bucket <= right)
    if (sliced.length < 2) { setRefAreaLeft(null); setRefAreaRight(null); return }

    setZoomStack(prev => [...prev, zoomedData ?? data])
    setZoomedData(sliced)
    setRefAreaLeft(null)
    setRefAreaRight(null)
  }, [refAreaLeft, refAreaRight, displayData, zoomedData, data])

  const zoomOut = useCallback(() => {
    if (zoomStack.length === 0) return
    const prev = zoomStack[zoomStack.length - 1]
    setZoomedData(prev.length === data.length ? null : prev)
    setZoomStack(s => s.slice(0, -1))
  }, [zoomStack, data])

  const resetZoom = useCallback(() => {
    setZoomedData(null)
    setZoomStack([])
  }, [])

  //Format date 
  // Gap-urile au avg=null → linia se rupe automat 
  const chartData = displayData.map(d => ({
    bucket:   d.bucket,
    avg:      d.is_gap ? null : parseFloat(d.avg),
    min:      d.is_gap ? null : parseFloat(d.min),
    max:      d.is_gap ? null : parseFloat(d.max),
    is_gap:   !!d.is_gap,
    gap_minutes: d.gap_minutes,
  }))

  const isZoomed = zoomedData !== null

  return (
    <div className="card">
      {/* Titlu */}
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{sensor_name}</div>
          <div className="text-xs text-muted" style={{ marginTop: 2 }}>
            {displayData.length} puncte
            {gapCount > 0 && (
              <span style={{ color: 'var(--warning)', marginLeft: 8 }}>
                · {gapCount} gap{gapCount > 1 ? '-uri' : ''} detectat{gapCount > 1 ? 'e' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Interval select. */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {INTERVALS.map(iv => (
              <button
                key={iv.value}
                onClick={() => { resetZoom(); onIntervalChange?.(iv.value) }}
                className="btn btn-sm"
                style={{
                  padding: '4px 8px', fontSize: 11,
                  background: interval === iv.value && !isZoomed ? 'var(--primary)' : 'var(--bg3)',
                  color:      interval === iv.value && !isZoomed ? '#fff' : 'var(--text2)',
                  border: '1px solid var(--border)',
                }}
              >
                {iv.label}
              </button>
            ))}
          </div>

          {/* zoom */}
          {isZoomed && (
            <div className="flex gap-1">
              <button className="btn btn-ghost btn-sm btn-icon" onClick={zoomOut} title="Zoom out">
                <ZoomOut size={13} />
              </button>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={resetZoom} title="Reset zoom">
                <RotateCcw size={13} />
              </button>
            </div>
          )}
          {isZoomed && (
            <span style={{
              fontSize: 10, background: 'var(--primary-dim)',
              color: 'var(--primary)', padding: '2px 7px', borderRadius: 10,
            }}>zoom</span>
          )}
        </div>
      </div>


      {validData.length > 0 && (
        <div className="flex gap-3" style={{ marginBottom: 14 }}>
          <StatPill icon={<Minus size={11} />}      label="Avg" value={avgValue} unit={unit} color={color} />
          <StatPill icon={<TrendingDown size={11} />} label="Min" value={minValue} unit={unit} color="var(--success)" />
          <StatPill icon={<TrendingUp size={11} />}   label="Max" value={maxValue} unit={unit} color="var(--danger)" />
        </div>
      )}

     
      {loading ? (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="spinner" />
        </div>
      ) : chartData.length === 0 ? (
        <div style={{
          height: 200, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'var(--text3)', fontSize: 13,
          border: '1px dashed var(--border)', borderRadius: 8,
        }}>
          Nicio data in intervalul selectat
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
            {isZoomed ? 'Trage pe grafic pentru a mări mai mult · ' : 'Trage pe grafic pentru a mări · '}
            <span style={{ color: 'var(--text2)' }}>Zona gri = date lipsa</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart
              data={chartData}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              style={{ userSelect: 'none', cursor: isDragging ? 'crosshair' : 'default' }}
              margin={{ top: 4, right: 4, bottom: 0, left: -10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="bucket"
                tickFormatter={b => formatBucket(b, granularity)}
                tick={{ fontSize: 10, fill: 'var(--text3)' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--text3)' }}
                domain={['auto', 'auto']}
              />
              <Tooltip
                content={<CustomTooltip granularity={granularity} unit={unit} />}
                cursor={{ stroke: 'var(--border2)', strokeWidth: 1 }}
              />

              
              {chartData.map((d, i) => d.is_gap ? (
                <ReferenceArea
                  key={i}
                  x1={chartData[i - 1]?.bucket}
                  x2={chartData[i + 1]?.bucket}
                  fill="var(--warning)"
                  fillOpacity={0.07}
                  stroke="var(--warning)"
                  strokeOpacity={0.2}
                  strokeDasharray="4 4"
                />
              ) : null)}

              {/* Linia AVG */}
              <Line
                type="monotone"
                dataKey="avg"
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: color }}
                connectNulls={false}
                name="avg"
                isAnimationActive={false}
              />

              {/* Min sau Max ca linii subtiri */}
              <Line
                type="monotone"
                dataKey="min"
                stroke={color}
                strokeWidth={1}
                strokeDasharray="3 3"
                strokeOpacity={0.4}
                dot={false}
                connectNulls={false}
                name="min"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="max"
                stroke={color}
                strokeWidth={1}
                strokeDasharray="3 3"
                strokeOpacity={0.4}
                dot={false}
                connectNulls={false}
                name="max"
                isAnimationActive={false}
              />

              {/* Zona zoom selectata */}
              {isDragging && refAreaLeft && refAreaRight && (
                <ReferenceArea
                  x1={refAreaLeft}
                  x2={refAreaRight}
                  fill="var(--primary)"
                  fillOpacity={0.15}
                  stroke="var(--primary)"
                  strokeOpacity={0.5}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}

function StatPill({ icon, label, value, unit, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      background: 'var(--bg3)', borderRadius: 6,
      padding: '4px 10px', fontSize: 12,
    }}>
      <span style={{ color }}>{icon}</span>
      <span style={{ color: 'var(--text3)' }}>{label}</span>
      <span style={{ fontWeight: 600, color }}>
        {value !== null && value !== undefined ? `${value}${unit}` : '—'}
      </span>
    </div>
  )
}
