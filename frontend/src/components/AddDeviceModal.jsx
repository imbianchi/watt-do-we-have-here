import { useEffect, useRef, useState } from 'react'
import { Devices } from '../lib/api'
import { ICONS } from '../lib/format'
import { useToast } from '../lib/toast'
import { useEscapeKey, useFocusTrap } from '../lib/hooks'

const IP_RE = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$/

const EQUIPMENT_OPTIONS = [
  'Water heater', 'Heating', 'Air conditioning', 'Washing machine',
  'Dishwasher', 'Refrigerator', 'Lighting', 'Other',
]

export default function AddDeviceModal({ isOpen, onClose, onSuccess }) {
  const toast = useToast()
  const dialogRef = useRef(null)

  const [name, setName] = useState('')
  const [ip, setIp] = useState('')
  const [password, setPassword] = useState('')
  const [location, setLocation] = useState('')
  const [equipment, setEquipment] = useState('')
  const [icon, setIcon] = useState('plug')
  const [submitting, setSubmitting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null) // {ok, message}
  const [error, setError] = useState(null)

  useEscapeKey(isOpen, () => !submitting && close())
  useFocusTrap(isOpen, dialogRef)

  // Reset on open/close
  useEffect(() => {
    if (!isOpen) reset()
  }, [isOpen])

  // Invalidate test result if creds change
  useEffect(() => { setTestResult(null) }, [ip, password])

  if (!isOpen) return null

  function reset() {
    setName(''); setIp(''); setPassword(''); setLocation('')
    setEquipment(''); setIcon('plug'); setError(null)
    setSubmitting(false); setTesting(false); setTestResult(null)
  }

  function close() {
    reset()
    onClose()
  }

  async function testConnection() {
    setError(null)
    if (!IP_RE.test(ip)) { setError('Invalid IP address'); return }
    setTesting(true)
    setTestResult(null)
    try {
      const r = await Devices.test({ name: name || 'test', ip, password: password || null })
      const gen = r.gen
      let warning = null
      let message
      if (gen === 1) {
        message = `Gen1 device detected: ${r.model || 'unknown'}`
        warning = 'This appears to be a Gen1 Shelly. Schedule and script management may not be available. Basic monitoring and control will work.'
      } else if (gen >= 2) {
        message = `Gen${gen} device detected: ${r.model || 'unknown model'}`
      } else {
        message = `Connected · ${r.voltage?.toFixed?.(1) ?? '—'} V · switch ${r.switch_state ? 'ON' : 'OFF'}`
      }
      setTestResult({ ok: true, gen, model: r.model, message, warning })
    } catch (err) {
      setTestResult({ ok: false, message: err.response?.data?.detail || err.message || 'Connection failed' })
    } finally {
      setTesting(false)
    }
  }

  async function submit(e) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Name is required')
    if (!IP_RE.test(ip)) return setError('Invalid IP address')

    setSubmitting(true)
    try {
      const created = await Devices.add({
        name: name.trim(),
        ip: ip.trim(),
        password: password || null,
        location: location.trim() || null,
        equipment: equipment || null,
        icon,
      })
      toast(`Device "${created.name}" added`, 'success')
      onSuccess(created)
      reset()
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to add device'
      setError(msg)
      toast(msg, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-[fadeIn_140ms_ease-out]"
         onClick={() => !submitting && close()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-device-title"
        className="card w-full max-w-md p-6 animate-[modalIn_180ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 id="add-device-title" className="text-lg font-semibold">Add Shelly device</h3>
          <button onClick={close} disabled={submitting}
                  aria-label="Close dialog"
                  className="text-gray-500 hover:text-gray-200 text-xl leading-none transition-colors disabled:opacity-50">×</button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Name" required>
            <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)}
                   placeholder="Termoacumulador" className="input" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="IP address" required>
              <input type="text" value={ip} onChange={(e) => setIp(e.target.value)}
                     placeholder="192.168.1.100" className="input font-mono" />
            </Field>
            <Field label="Password">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                     placeholder="—" className="input" />
            </Field>
          </div>

          {/* Test connection */}
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={testConnection} disabled={testing || !ip}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-card-hover border border-line text-gray-300 hover:bg-line transition-colors disabled:opacity-50 flex items-center gap-2">
              {testing && <span className="w-3 h-3 rounded-full border-2 border-gray-500 border-t-gray-200 animate-spin" />}
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            {testResult && (
              <div className={`text-xs flex-1 text-right ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {testResult.ok ? '✓' : '✕'} {testResult.message}
              </div>
            )}
          </div>
          {testResult?.warning && (
            <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
              ⚠ {testResult.warning}
            </div>
          )}

          <Field label="Location">
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                   placeholder="Bathroom" className="input" />
          </Field>

          <Field label="Equipment">
            <select value={equipment} onChange={(e) => setEquipment(e.target.value)} className="input">
              <option value="">Select…</option>
              {EQUIPMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>

          <Field label="Icon">
            <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Device icon">
              {Object.entries(ICONS).map(([k, emoji]) => (
                <button key={k} type="button" onClick={() => setIcon(k)}
                        role="radio" aria-checked={icon === k}
                        className={`w-10 h-10 rounded-lg text-xl border transition-colors active:scale-95 ${
                          icon === k ? 'border-primary bg-primary/20' : 'border-line bg-card-hover hover:bg-line'
                        }`}>
                  {emoji}
                </button>
              ))}
            </div>
          </Field>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2.5">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={close} disabled={submitting}
                    className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-card-hover transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
                    className="px-5 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-dim transition-colors disabled:opacity-50 flex items-center gap-2 active:scale-95">
              {submitting && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              {submitting ? 'Adding…' : 'Add device'}
            </button>
          </div>
        </form>

        <style>{`
          .input { background:#0a0a0f; border:1px solid #1e1e2e; border-radius:0.5rem;
                   padding:0.5rem 0.75rem; font-size:0.875rem; color:#e5e7eb; width:100%; outline:none;
                   transition: border-color 150ms; }
          .input:focus { border-color:#6366f1; }
          @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
          @keyframes modalIn { from { opacity: 0; transform: translateY(8px) scale(0.97) }
                               to   { opacity: 1; transform: translateY(0) scale(1) } }
        `}</style>
      </div>
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-gray-400 uppercase tracking-wider">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  )
}
