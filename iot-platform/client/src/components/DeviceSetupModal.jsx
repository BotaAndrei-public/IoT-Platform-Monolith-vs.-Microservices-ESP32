import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { X, Copy, CheckCheck, Wifi, QrCode, ChevronRight, RotateCcw } from 'lucide-react'
import { SERVER_URL } from '../lib/config'

/*
 * Meniu pt. adaugarea lui noi disp. 
 * Ajuta user-ul sa faca setup-ul esp-urilor si sa de adauge in sistem
 */
export function DeviceSetupModal({ device, onClose }) {
  const [lang, setLang] = useState('en') // 'en' | 'ro'
  const [step, setStep] = useState(0)
  const [copied, setCopied] = useState({})

  const copy = async (key, val) => {
    await navigator.clipboard.writeText(val)
    setCopied(c => ({ ...c, [key]: true }))
    setTimeout(() => setCopied(c => ({ ...c, [key]: false })), 2000)
  }

  // QR payload Date timise spre ESP via cod QR
  const qrPayload = `http://192.168.4.1?server=${encodeURIComponent(SERVER_URL)}&device_id=${device.id}&api_key=${device.api_key}`

  const t = TRANSLATIONS[lang]

  const steps = [
    { id: 'power',  icon: '🔌', ...t.steps[0] },
    { id: 'wifi',   icon: '📶', ...t.steps[1] },
    { id: 'qr',     icon: '📱', ...t.steps[2] },
    { id: 'form',   icon: '⚙️',  ...t.steps[3] },
    { id: 'done',   icon: '✅', ...t.steps[4] },
  ]

  const isLast = step === steps.length - 1

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520, padding: 0, overflow: 'hidden' }}>

        {/* TITLU*/}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--bg2)',
        }}>
          <div className="flex items-center gap-3">
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              background: 'var(--primary-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Wifi size={17} color="var(--primary)" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{t.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{device.name}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Limba*/}
            <div style={{
              display: 'flex', background: 'var(--bg3)',
              border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden',
            }}>
              {['en', 'ro'].map(l => (
                <button key={l} onClick={() => setLang(l)}
                  style={{
                    padding: '4px 10px', border: 'none', cursor: 'pointer',
                    background: lang === l ? 'var(--primary)' : 'transparent',
                    color: lang === l ? '#fff' : 'var(--text3)',
                    fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
                    textTransform: 'uppercase',
                  }}>
                  {l}
                </button>
              ))}
            </div>

            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Bara de progrs in config.*/}
        <div style={{ height: 3, background: 'var(--border)' }}>
          <div style={{
            height: '100%', background: 'var(--primary)',
            width: `${((step + 1) / steps.length) * 100}%`,
            transition: 'width 0.3s ease',
          }} />
        </div>

       
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 8,
          padding: '14px 24px 0',
        }}>
          {steps.map((s, i) => (
            <button key={s.id} onClick={() => setStep(i)}
              style={{
                width: i === step ? 20 : 8, height: 8, borderRadius: 4,
                background: i <= step ? 'var(--primary)' : 'var(--border)',
                border: 'none', cursor: 'pointer', padding: 0,
                transition: 'all 0.2s',
              }} />
          ))}
        </div>

      
        <div style={{ padding: '20px 24px' }}>
          <div style={{
            fontSize: 28, textAlign: 'center', marginBottom: 12,
          }}>
            {steps[step].icon}
          </div>

          <div style={{
            fontWeight: 700, fontSize: 16, textAlign: 'center', marginBottom: 8,
          }}>
            {t.stepLabel} {step + 1}/{steps.length} — {steps[step].title}
          </div>

          <div style={{
            fontSize: 13, color: 'var(--text2)', textAlign: 'center',
            lineHeight: 1.7, marginBottom: 20,
          }}>
            {steps[step].desc}
          </div>

     
          {step === 1 && <WifiStep lang={lang} />}
          {step === 2 && <QrStep qrPayload={qrPayload} device={device} lang={lang} copy={copy} copied={copied} />}
          {step === 3 && <FormStep lang={lang} />}
          {step === 4 && <DoneStep lang={lang} onClose={onClose} />}
        </div>

      
        {step < 4 && (
          <div style={{
            padding: '0 24px 20px',
            display: 'flex', gap: 10,
          }}>
            <button
              className="btn btn-ghost"
              style={{ flex: 1 }}
              disabled={step === 0}
              onClick={() => setStep(s => s - 1)}
            >
              ← {t.back}
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 2 }}
              onClick={() => setStep(s => s + 1)}
            >
              {t.next} <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Instructinui conn la wifi
function WifiStep({ lang }) {
  const t = lang === 'en' ? {
    ssid: 'Look for a WiFi network named:',
    note: 'No password required. Your internet may appear disconnected — this is normal.',
  } : {
    ssid: 'Cauta o retea WiFi cu numele:',
    note: 'Nu are parola. Internetul poate parea deconectat — e normal.',
  }

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 12, fontSize: 13, color: 'var(--text2)' }}>
        {t.ssid}
      </div>
      <div style={{
        background: 'var(--bg3)', border: '2px solid var(--primary)',
        borderRadius: 10, padding: '12px 20px',
        fontFamily: 'monospace', fontSize: 18, fontWeight: 700,
        color: 'var(--primary)', textAlign: 'center', letterSpacing: 1,
        marginBottom: 12,
      }}>
        IoT-Setup-XXXXXX
      </div>
      <div style={{
        fontSize: 11, color: 'var(--text3)', textAlign: 'center',
        padding: '8px 12px', background: 'var(--bg3)',
        borderRadius: 6, lineHeight: 1.6,
      }}>
        💡 {t.note}
      </div>
    </div>
  )
}

// Cod QR
function QrStep({ qrPayload, device, lang, copy, copied }) {
  const t = lang === 'en' ? {
    scan: 'Scan to open the setup page with your credentials pre-filled:',
    or: 'or open manually:',
    url: 'Setup page URL',
    creds: 'Your credentials are already encoded in the QR code — no need to copy them manually.',
    manual: lang === 'en' ? 'Manual entry (if QR doesn\'t work)' : 'Introducere manuala',
  } : {
    scan: 'Scaneaza pentru a deschide pagina de setup cu datele pre-completate:',
    or: 'sau deschide manual:',
    url: 'URL pagina setup',
    creds: 'Credentialele tale sunt deja in QR — nu trebuie sa le copiezi manual.',
    manual: 'Introducere manuala (daca QR nu merge)',
  }

  const [showManual, setShowManual] = useState(false)

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', marginBottom: 16 }}>
        {t.scan}
      </div>

      {/* QR */}
      <div style={{
        display: 'flex', justifyContent: 'center', marginBottom: 16,
      }}>
        <div style={{
          padding: 16, background: '#ffffff', borderRadius: 12,
          boxShadow: '0 2px 16px rgba(0,0,0,0.15)',
          display: 'inline-block',
        }}>
          <QRCodeSVG
            value={qrPayload}
            size={180}
            fgColor="#1a1d2e"
            bgColor="#ffffff"
            level="M"
            includeMargin={false}
          />
        </div>
      </div>

      <div style={{
        fontSize: 11, color: 'var(--text3)', textAlign: 'center',
        padding: '8px 14px', background: 'var(--bg3)',
        borderRadius: 6, marginBottom: 12, lineHeight: 1.6,
      }}>
        ✓ {t.creds}
      </div>

      {/* toggle pentu comp. manual */}
      <button
        onClick={() => setShowManual(v => !v)}
        style={{
          width: '100%', background: 'none', border: '1px solid var(--border)',
          borderRadius: 6, padding: '8px 12px', cursor: 'pointer',
          color: 'var(--text3)', fontSize: 12, textAlign: 'left',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <span>⚙ {lang === 'en' ? 'Manual entry (if QR doesn\'t work)' : 'Introducere manuala'}</span>
        <span>{showManual ? '▲' : '▼'}</span>
      </button>

      {showManual && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: lang === 'en' ? 'Setup URL' : 'URL Setup', value: 'http://192.168.4.1', key: 'url' },
            { label: 'Device ID', value: device.id, key: 'did' },
            { label: 'API Key', value: device.api_key, key: 'key', secret: true },
            { label: 'Server URL', value: SERVER_URL, key: 'srv' },
          ].map(({ label, value, key, secret }) => (
            <div key={key}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>{label}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="input"
                  readOnly
                  type={secret ? 'password' : 'text'}
                  value={value}
                  style={{ fontFamily: 'monospace', fontSize: 11 }}
                />
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => copy(key, value)}>
                  {copied[key]
                    ? <CheckCheck size={13} color="var(--success)" />
                    : <Copy size={13} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Cateva instructinui
function FormStep({ lang }) {
  const items = lang === 'en' ? [
    { icon: '📶', text: 'Select your home WiFi network from the dropdown' },
    { icon: '🔒', text: 'Enter your WiFi password' },
    { icon: '✅', text: 'Server URL, Device ID and API Key are already pre-filled from the QR code' },
    { icon: '🚀', text: 'Tap "Connect" and wait a few seconds' },
  ] : [
    { icon: '📶', text: 'Selecteaza reteaua WiFi de acasa din lista' },
    { icon: '🔒', text: 'Introdu parola WiFi' },
    { icon: '✅', text: 'Server URL, Device ID si API Key sunt deja completate din QR' },
    { icon: '🚀', text: 'Apasa "Connect" si asteapta cateva secunde' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '10px 14px', background: 'var(--bg3)',
          borderRadius: 8, border: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
          <span style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
            {item.text}
          </span>
        </div>
      ))}
    </div>
  )
}

// Pct. de final
function DoneStep({ lang, onClose }) {
  const t = lang === 'en' ? {
    msg: 'After tapping "Connect" on the ESP setup page, it will reconnect to your home WiFi and appear as Online in a few seconds.',
    hint: 'Reconnect your phone/PC to your home WiFi, then refresh the Devices page.',
    refresh: 'Refresh Devices',
  } : {
    msg: 'Dupa ce apesi "Connect" pe pagina ESP, acesta se va reconecta la WiFi-ul casei si va aparea Online in cateva secunde.',
    hint: 'Reconecteaza-te la WiFi-ul casei, apoi da refresh la pagina Devices.',
    refresh: 'Refresh Devices',
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontSize: 13, color: 'var(--text2)', lineHeight: 1.8,
        marginBottom: 16,
      }}>
        {t.msg}
      </div>
      <div style={{
        padding: '10px 16px', background: 'var(--bg3)',
        borderRadius: 8, fontSize: 12, color: 'var(--text3)',
        marginBottom: 20, lineHeight: 1.6,
      }}>
        💡 {t.hint}
      </div>
      <button
        className="btn btn-primary"
        style={{ width: '100%', justifyContent: 'center' }}
        onClick={() => { onClose(); window.location.reload() }}
      >
        <RotateCcw size={14} /> {t.refresh}
      </button>
    </div>
  )
}

//Text
const TRANSLATIONS = {
  en: {
    title: 'Connect your ESP32',
    stepLabel: 'Step',
    back: 'Back',
    next: 'Next',
    steps: [
      {
        title: 'Power up the ESP32',
        desc: 'Connect the ESP32 to power (USB or external). The LED will blink slowly — this means it\'s in Setup mode waiting for configuration.',
      },
      {
        title: 'Connect to ESP WiFi',
        desc: 'On your phone or PC, open WiFi settings and connect to the ESP\'s network. It has no password.',
      },
      {
        title: 'Scan QR Code',
        desc: 'Open your phone camera or a QR scanner and scan the code below. It will open the ESP setup page with your credentials already filled in.',
      },
      {
        title: 'Fill in the form',
        desc: 'On the ESP setup page, select your home WiFi and enter the password. Everything else is pre-filled.',
      },
      {
        title: 'All done!',
        desc: 'Your ESP32 is connecting to your network. In a few seconds it will appear online.',
      },
    ],
  },
  ro: {
    title: 'Conecteaza ESP32-ul',
    stepLabel: 'Pasul',
    back: 'Inapoi',
    next: 'Urmator',
    steps: [
      {
        title: 'Alimenteaza ESP32-ul',
        desc: 'Conecteaza ESP32-ul la curent (USB sau sursa externa). LED-ul va clipi incet — asta inseamna ca e in modul Setup si asteapta configuratia.',
      },
      {
        title: 'Conecteaza-te la WiFi-ul ESP-ului',
        desc: 'Pe telefon sau PC, deschide setarile WiFi si conecteaza-te la reteaua ESP-ului. Nu are parola.',
      },
      {
        title: 'Scaneaza codul QR',
        desc: 'Deschide camera telefonului sau un scanner QR si scaneaza codul de mai jos. Va deschide pagina de setup cu datele tale deja completate.',
      },
      {
        title: 'Completeaza formularul',
        desc: 'Pe pagina de setup a ESP-ului, selecteaza WiFi-ul casei si introdu parola. Restul campurilor sunt deja completate.',
      },
      {
        title: 'Gata!',
        desc: 'ESP32-ul tau se conecteaza la retea. In cateva secunde va aparea online.',
      },
    ],
  },
}
