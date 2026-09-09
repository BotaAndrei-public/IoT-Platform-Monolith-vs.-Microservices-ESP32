import { useState } from 'react'
import { Wifi, Copy, CheckCheck, RefreshCw, X } from 'lucide-react'
import { SERVER_URL } from '../lib/config'

/*
 * Meniu pt. adaugarea lui noi disp. 
 * Ajuta user-ul sa faca setup-ul esp-urilor si sa de adauge in sistem
 */
export function ProvisioningGuide({ device, onClose }) {
  const [copied, setCopied] = useState({})

  const copy = async (key, text) => {
    await navigator.clipboard.writeText(text)
    setCopied(c => ({ ...c, [key]: true }))
    setTimeout(() => setCopied(c => ({ ...c, [key]: false })), 2000)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'var(--primary-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Wifi size={18} color="var(--primary)" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Conecteaza ESP32-ul</div>
              <div className="text-xs text-muted">{device.name}</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

     
        <ProvisioningTabs device={device} copy={copy} copied={copied} />
      </div>
    </div>
  )
}

function ProvisioningTabs({ device, copy, copied }) {
  const [tab, setTab] = useState('auto')

  return (
    <div>
    
      <div style={{
        display: 'flex', background: 'var(--bg3)',
        borderRadius: 8, padding: 4, marginBottom: 20, gap: 4,
      }}>
        {[
          { id: 'auto',   label: '✨ Setup automat' },
          { id: 'manual', label: '⚙ Manual (avansат)' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '7px 12px', border: 'none', cursor: 'pointer',
              borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: tab === t.id ? 'var(--bg2)' : 'transparent',
              color: tab === t.id ? 'var(--text)' : 'var(--text3)',
              transition: 'all 0.15s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'auto'
        ? <AutoTab device={device} />
        : <ManualTab device={device} copy={copy} copied={copied} />
      }
    </div>
  )
}

// Tabul auto
function AutoTab({ device }) {
  const [step, setStep] = useState(0)

  const steps = [
    {
      icon: '🔌',
      title: 'Alimenteaza ESP32-ul',
      desc: 'Conecteaza ESP32-ul la curent. LED-ul va clipi rar — asta inseamna ca e in modul Setup si asteapta configuratia.',
      hint: 'Daca LED-ul nu clipeste, firmware-ul vechi nu suporta setup automat. Foloseste tab-ul Manual.',
    },
    {
      icon: '📶',
      title: 'Conecteaza-te la WiFi-ul ESP-ului',
      desc: 'Pe telefon sau PC, deschide setarile WiFi si cauta o retea numita "IoT-Setup-XXXXXX". Conecteaza-te (nu are parola).',
      hint: 'Dupa conectare, internetul poate parea ca nu merge — e normal, esti conectat direct la ESP.',
    },
    {
      icon: '🌐',
      title: 'Deschide pagina de configurare',
      desc: 'Deschide browser-ul si mergi la adresa de mai jos. Daca nu se deschide automat, scrie adresa manual.',
      extra: (
        <div style={{
          background: 'var(--bg)', border: '1px solid var(--primary)',
          borderRadius: 8, padding: '10px 14px', marginTop: 10,
          fontFamily: 'monospace', fontSize: 16, fontWeight: 700,
          color: 'var(--primary)', textAlign: 'center',
        }}>
          http://192.168.4.1
        </div>
      ),
    },
    {
      icon: '🔑',
      title: 'Completeaza formularul',
      desc: 'In pagina de setup vei vedea campuri pre-completate cu datele device-ului tau. Trebuie sa introduci doar parola WiFi-ului casei.',
      hint: 'Device ID si API Key sunt deja completate automat — nu trebuie sa le copiezi manual.',
    },
    {
      icon: '✅',
      title: 'Gata!',
      desc: 'Dupa ce apesi "Conecteaza", ESP32-ul se va reconecta la WiFi-ul casei si va aparea Online in cateva secunde.',
      hint: 'Reconecteaza-te si tu la WiFi-ul casei si da refresh la pagina Devices.',
    },
  ]

  return (
    <div>
      {/* Progesul */}
      <div className="flex items-center justify-between mb-6" style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute', top: 14, left: '10%', right: '10%',
          height: 2, background: 'var(--border)',
        }} />
        {steps.map((s, i) => (
          <div key={i} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            position: 'relative', zIndex: 1,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: i <= step ? 'var(--primary)' : 'var(--bg3)',
              border: `2px solid ${i <= step ? 'var(--primary)' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700,
              color: i <= step ? '#fff' : 'var(--text3)',
              transition: 'all 0.2s',
              cursor: 'pointer',
            }} onClick={() => setStep(i)}>
              {i < step ? '✓' : i + 1}
            </div>
          </div>
        ))}
      </div>

      {/* Pas curent */}
      <div style={{
        background: 'var(--bg3)', borderRadius: 10,
        border: '1px solid var(--border)', padding: 20, marginBottom: 16,
      }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>{steps[step].icon}</div>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
          Pasul {step + 1}: {steps[step].title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
          {steps[step].desc}
        </div>
        {steps[step].extra}
        {steps[step].hint && (
          <div style={{
            marginTop: 12, padding: '8px 12px',
            background: 'var(--bg)', borderRadius: 6,
            fontSize: 11, color: 'var(--text3)',
            borderLeft: '3px solid var(--border2)',
          }}>
            💡 {steps[step].hint}
          </div>
        )}
      </div>

      {/* navigare */}
      <div className="flex gap-2">
        <button className="btn btn-ghost" style={{ flex: 1 }}
          disabled={step === 0}
          onClick={() => setStep(s => s - 1)}>
          ← Inapoi
        </button>
        {step < steps.length - 1 ? (
          <button className="btn btn-primary" style={{ flex: 1 }}
            onClick={() => setStep(s => s + 1)}>
            Urmatorul pas →
          </button>
        ) : (
          <button className="btn btn-success" style={{ flex: 1 }}
            onClick={() => window.location.reload()}>
            <RefreshCw size={14} /> Refresh devices
          </button>
        )}
      </div>
    </div>
  )
}

//manual
function ManualTab({ device, copy, copied }) {
  return (
    <div>
      <div style={{
        padding: '10px 14px', borderRadius: 8, marginBottom: 16,
        background: 'var(--bg3)', border: '1px solid var(--border)',
        fontSize: 12, color: 'var(--text3)',
      }}>
        ⚠ Setup manual necesita PlatformIO si modificarea fisierului <code>config.h</code>.
        Recomandat doar daca intelegi ce face aplicatia.
      </div>

     
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'SERVER_URL', value: SERVER_URL, key: 'server' },
          { label: 'DEVICE_ID',  value: device.id,      key: 'did' },
          { label: 'API_KEY',    value: device.api_key,  key: 'key', secret: true },
        ].map(({ label, value, key, secret }) => (
          <div key={key}>
            <label className="label">{label}</label>
            <div className="flex gap-2">
              <input
                className="input"
                readOnly
                type={secret ? 'password' : 'text'}
                value={value}
                style={{ fontFamily: 'monospace', fontSize: 11 }}
              />
              <button className="btn btn-ghost btn-sm btn-icon"
                onClick={() => copy(key, value)}>
                {copied[key]
                  ? <CheckCheck size={14} color="var(--success)" />
                  : <Copy size={14} />}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        background: 'var(--bg3)', borderRadius: 8,
        border: '1px solid var(--border)', padding: 14,
        fontSize: 12, color: 'var(--text2)', lineHeight: 2,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>
          In <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 3 }}>firmware/src/config.h</code> seteaza:
        </div>
        <code style={{
          display: 'block', background: 'var(--bg)',
          borderRadius: 6, padding: '10px 14px',
          fontSize: 11, lineHeight: 1.8, color: 'var(--success)',
        }}>
          {`#define WIFI_SSID     "WiFi-ul-tau"\n#define WIFI_PASSWORD "parola"\n#define SERVER_URL    "${SERVER_URL}"\n#define DEVICE_ID     "${device.id.slice(0, 8)}..."\n#define API_KEY       "${device.api_key.slice(0, 12)}..."`}
        </code>
      </div>
    </div>
  )
}
