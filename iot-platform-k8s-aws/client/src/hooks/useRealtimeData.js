import { useState, useEffect, useRef, useCallback } from 'react'

// Polling simplu merge pe orice host, eu am incercat si cu Cloudflare Tunnel

const POLL_INTERVAL_MS = 3000

export function useRealtimeData({ user, selectedDeviceId, onAlert, onNewReadings }) {
  const [latestValues, setLatestValues] = useState({})
  const pollRef    = useRef(null)
  const prevVals   = useRef({})
  const mountedRef = useRef(true)

  const poll = useCallback(async () => {
    if (!mountedRef.current || !selectedDeviceId) return
    try {
      const token = localStorage.getItem('iot_token')
      const res = await fetch(`/api/telemetry/${selectedDeviceId}/latest`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok || !mountedRef.current) return

      const rows = await res.json()
      const lv = {}
      rows.forEach(r => { lv[r.sensor_id] = r })

      // Vede valori noi (timestamp diferit fata de poll-ul anterior)
      const newReadings = []
      rows.forEach(r => {
        const prev = prevVals.current[r.sensor_id]
        if (!prev || prev.recorded_at !== r.recorded_at) {
          newReadings.push(r)
        }
      })
      prevVals.current = lv

      setLatestValues(lv)
      if (newReadings.length > 0) onNewReadings?.(newReadings)

      // Verifica alerte noi
      const alertRes = await fetch(
        `/api/alerts?unacknowledged=true&limit=5`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (alertRes.ok && mountedRef.current) {
        const alerts = await alertRes.json()
        // Notifica alertele din ultimele 30 sec.
        const cutoff = Date.now() - 30000
        alerts
          .filter(a => new Date(a.created_at).getTime() > cutoff)
          .forEach(a => onAlert?.(a))
      }
    } catch {}
  }, [selectedDeviceId, onAlert, onNewReadings])

  useEffect(() => {
    if (!user || !selectedDeviceId) return
    mountedRef.current = true
    prevVals.current = {}

    // Poll imediat si dupa fiecare POLL_INTERVAL_MS
    poll()
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      mountedRef.current = false
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [user, selectedDeviceId, poll])

  return { latestValues, setLatestValues }
}
