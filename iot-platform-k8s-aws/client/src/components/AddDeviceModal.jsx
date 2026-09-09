import { useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../context/ToastContext'

export function AddDeviceModal({ onClose, onCreated }) {
  const { toast } = useToast()
  const [form, setForm] = useState({ name: '', description: '' })
  const [loading, setLoading] = useState(false)

  const handle = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setLoading(true)
    try {
      const device = await api.createDevice(form)
      toast(`Device "${device.name}" creat!`, 'success')
      onCreated(device)
    } catch (err) {
      toast(err.message, 'danger')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="flex items-center justify-between mb-4">
          <h2 className="modal-title" style={{ margin: 0 }}>Device nou</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handle}>
          <div className="form-group mb-4">
            <label className="label">Nume device *</label>
            <input
              className="input"
              placeholder="ex: ESP32 Camera Living"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="form-group mb-4">
            <label className="label">Descriere (optional)</label>
            <input
              className="input"
              placeholder="ex: Senzori temperatura si fum"
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="flex gap-2 justify-between mt-4">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Anuleaza</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !form.name.trim()}>
              {loading ? <span className="spinner" /> : null}
              Creeaza device
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
