import { useEffect, useState } from 'react'
import { Devices } from '../lib/api'
import { relativeTime } from '../lib/format'
import { useToast } from '../lib/toast'
import { useTick } from '../lib/hooks'
import EmptyState from './EmptyState'

export default function AlertsPanel({ deviceId }) {
  const toast = useToast()
  const [config, setConfig] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [threshold, setThreshold] = useState('')
  const [duration, setDuration] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useTick(15000) // refresh "Xs ago" labels

  const load = async () => {
    if (deviceId === 'all') return
    try {
      const cfg = await Devices.alertConfig(deviceId)
      setConfig(cfg)
      if (cfg && cfg.threshold_watts) {
        setThreshold(String(cfg.threshold_watts))
        setDuration(String(cfg.duration_minutes))
        setEnabled(!!cfg.enabled)
      } else {
        setThreshold(''); setDuration(''); setEnabled(true)
      }
      const list = await Devices.alerts(deviceId)
      setAlerts(list)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    setConfig(null); setAlerts([]); setError(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId])

  if (deviceId === 'all') {
    return (
      <div className="card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-3">Alerts</h2>
        <EmptyState icon="🔔" title="Pick a single device to manage alerts" />
      </div>
    )
  }

  const save = async () => {
    setError(null)
    const t = parseFloat(threshold), d = parseInt(duration, 10)
    if (!t || t <= 0) { setError('Threshold must be positive'); toast('Threshold must be positive', 'error'); return }
    if (!d || d <= 0) { setError('Duration must be positive'); toast('Duration must be positive', 'error'); return }
    setSaving(true)
    try {
      await Devices.setAlertConfig(deviceId, { threshold_watts: t, duration_minutes: d, enabled })
      toast(`Alert rule saved: ≥${t}W for ${d}m`, 'success')
      await load()
    } catch (err) {
      const msg = err.response?.data?.detail || err.message
      setError(msg)
      toast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Alerts</h2>
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}
                 className="accent-primary" />
          Enabled
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <Field label="If watts ≥">
          <input type="number" min="0" value={threshold} onChange={(e) => setThreshold(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && save()}
                 placeholder="1500" className="alert-input font-mono" />
        </Field>
        <Field label="for at least (min)">
          <input type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && save()}
                 placeholder="5" className="alert-input font-mono" />
        </Field>
        <div className="flex items-end">
          <button onClick={save} disabled={saving}
                  className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dim disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2">
            {saving && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            {saving ? 'Saving…' : 'Save rule'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 mb-3">
          {error}
        </div>
      )}

      <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-2">Recent triggers</h3>
      {alerts.length === 0 ? (
        <EmptyState icon="✅" title="No alerts triggered yet"
                    hint="Set a threshold above. The collector checks each reading." />
      ) : (
        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
          {alerts.map((a) => (
            <AlertRow key={a.id} alert={a} />
          ))}
        </div>
      )}

      <style>{`
        .alert-input { background:#0a0a0f; border:1px solid #1e1e2e; border-radius:0.5rem;
                       padding:0.5rem 0.75rem; font-size:0.875rem; color:#e5e7eb; width:100%; outline:none;
                       transition: border-color 150ms; }
        .alert-input:focus { border-color:#6366f1; }
      `}</style>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      {children}
    </label>
  )
}

function AlertRow({ alert }) {
  const triggered = new Date(alert.triggered_at)
  const resolved = alert.resolved_at ? new Date(alert.resolved_at) : null
  const durationMin = resolved ? Math.round((resolved - triggered) / 60000) : null
  const active = !resolved
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-colors ${
      active ? 'bg-amber-500/10 border-amber-500/40' : 'bg-card-hover border-line hover:bg-line'
    }`}>
      <div className="flex items-center gap-3">
        <span className={active ? 'text-amber-400' : 'text-gray-500'}>{active ? '⚠' : '✓'}</span>
        <div>
          <div className="text-sm text-gray-200">
            {Math.round(alert.threshold_watts)}W for {alert.duration_minutes}m
          </div>
          <div className="text-[10px] text-gray-500" title={triggered.toLocaleString()}>
            {relativeTime(triggered)}
          </div>
        </div>
      </div>
      <div className="text-xs font-mono text-gray-400">
        {active ? 'active' : `${durationMin}m`}
      </div>
    </div>
  )
}
