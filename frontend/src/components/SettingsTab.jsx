import { useEffect, useState } from 'react'
import { Shelly } from '../lib/api'
import { useToast } from '../lib/toast'
import { CardSkeleton } from './Skeleton'

function rssiBars(rssi) {
  if (rssi == null) return 0
  if (rssi >= -55) return 4
  if (rssi >= -65) return 3
  if (rssi >= -75) return 2
  if (rssi >= -85) return 1
  return 0
}

export default function SettingsTab({ deviceId, device }) {
  const toast = useToast()
  const [info, setInfo] = useState(null)
  const [wifi, setWifi] = useState(null)
  const [cfg, setCfg] = useState(null)
  const [loading, setLoading] = useState(false)

  const [powerLimit, setPowerLimit] = useState('')
  const [autoRecover, setAutoRecover] = useState(true)
  const [savingLimit, setSavingLimit] = useState(false)

  const [showReboot, setShowReboot] = useState(false)
  const [rebooting, setRebooting] = useState(false)

  const [resetText, setResetText] = useState('')
  const [resetting, setResetting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [i, w, c] = await Promise.all([
        Shelly.info(deviceId).catch(() => null),
        Shelly.wifi(deviceId).catch(() => null),
        Shelly.config(deviceId).catch(() => null),
      ])
      setInfo(i); setWifi(w); setCfg(c)
      const lim = c?.switch?.power_limit
      const auto = c?.switch?.autorecover_voltage_errors
      if (lim != null) setPowerLimit(String(lim))
      if (auto != null) setAutoRecover(!!auto)
    } catch (e) {
      toast('Could not load diagnostics', 'error')
    } finally { setLoading(false) }
  }

  useEffect(() => { setInfo(null); setWifi(null); setCfg(null); load() }, [deviceId])

  const saveLimit = async (e) => {
    e?.preventDefault()
    const v = parseFloat(powerLimit)
    if (isNaN(v) || v < 0) { toast('Invalid power limit', 'warning'); return }
    setSavingLimit(true)
    try {
      await Shelly.setPowerLimit(deviceId, { power_limit: v, auto_recover: autoRecover })
      toast('Power protection saved', 'success', 2000)
      await load()
    } catch (e) {
      toast(e.response?.data?.detail || 'Save failed', 'error')
    } finally { setSavingLimit(false) }
  }

  const doReboot = async () => {
    setRebooting(true)
    try {
      await Shelly.reboot(deviceId)
      toast('Reboot requested — device will be back in ~10s', 'success', 4000)
      setShowReboot(false)
    } catch (e) {
      toast(e.response?.data?.detail || 'Reboot failed', 'error')
    } finally { setRebooting(false) }
  }

  const doFactoryReset = async () => {
    if (resetText !== 'RESET') return
    setResetting(true)
    try {
      await Shelly.factoryReset(deviceId)
      toast('Factory reset requested', 'success', 4000)
      setResetText('')
    } catch (e) {
      toast(e.response?.data?.detail || 'Reset failed', 'error')
    } finally { setResetting(false) }
  }

  if (loading && !info && !wifi && !cfg) {
    return <div className="flex flex-col gap-4"><CardSkeleton lines={4} /><CardSkeleton lines={3} /></div>
  }

  const bars = rssiBars(wifi?.rssi)

  return (
    <div className="flex flex-col gap-4">
      {/* Device info */}
      <div className="card p-5">
        <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-3">Device info</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Info label="Model" value={info?.model || device?.shelly_model || '—'} />
          <Info label="ID" value={<span className="font-mono">{info?.id || '—'}</span>} />
          <Info label="MAC" value={<span className="font-mono">{info?.mac || '—'}</span>} />
          <Info label="Generation" value={info?.gen ? `Gen ${info.gen}` : '—'} />
          <Info label="Firmware" value={<span className="font-mono">{info?.ver || '—'}</span>} />
          <Info label="App" value={info?.app || '—'} />
          <Info label="Auth enabled" value={info?.auth_en ? 'yes' : 'no'} />
          <Info label="Profile" value={info?.profile || '—'} />
        </div>
      </div>

      {/* WiFi */}
      <div className="card p-5">
        <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-3">WiFi</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          <Info label="SSID" value={wifi?.ssid || '—'} />
          <Info label="IP" value={<span className="font-mono">{wifi?.sta_ip || device?.ip || '—'}</span>} />
          <Info label="Status" value={wifi?.status || '—'} />
          <Info label="Signal" value={
            <div className="flex items-center gap-2">
              <SignalBars bars={bars} />
              <span className="font-mono text-xs text-gray-300">{wifi?.rssi != null ? `${wifi.rssi} dBm` : '—'}</span>
            </div>
          } />
        </div>
      </div>

      {/* Power protection */}
      <div className="card p-5">
        <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-3">Power protection</h3>
        <form onSubmit={saveLimit} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Max power limit (W)</label>
            <input type="number" min="0" value={powerLimit} onChange={(e) => setPowerLimit(e.target.value)}
                   className="bg-card-hover border border-line rounded-lg px-3 py-1.5 text-sm w-32 font-mono focus:outline-none focus:border-primary" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300 pb-1.5">
            <input type="checkbox" checked={autoRecover} onChange={(e) => setAutoRecover(e.target.checked)}
                   className="accent-primary" />
            Auto-recover after voltage error
          </label>
          <button type="submit" disabled={savingLimit}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dim disabled:opacity-50 active:scale-95 transition-all flex items-center gap-2">
            {savingLimit && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            Save
          </button>
        </form>
        <p className="text-[11px] text-gray-600 mt-2">
          When measured power exceeds the limit, the device protects itself by cutting the relay.
        </p>
      </div>

      {/* Reboot */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-100">Reboot device</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Safe to use — device comes back in ~10 seconds. Active timers are preserved.
            </p>
          </div>
          {showReboot ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowReboot(false)} disabled={rebooting}
                      className="px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:bg-line transition-colors">
                Cancel
              </button>
              <button onClick={doReboot} disabled={rebooting}
                      className="px-4 py-1.5 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 active:scale-95 transition-all flex items-center gap-2">
                {rebooting && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                Confirm reboot
              </button>
            </div>
          ) : (
            <button onClick={() => setShowReboot(true)}
                    className="px-4 py-1.5 rounded-lg text-sm font-medium bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25 active:scale-95 transition-all">
              Reboot
            </button>
          )}
        </div>
        {showReboot && (
          <div className="mt-3 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            ⚠ This will disconnect the device for ~10 seconds. The relay state is preserved.
          </div>
        )}
      </div>

      {/* Factory reset */}
      <div className="card p-5 border border-red-500/20">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-medium text-red-400">Factory reset</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Wipes WiFi credentials, schedules, scripts and webhooks. Cannot be undone.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input type="text" value={resetText} onChange={(e) => setResetText(e.target.value.toUpperCase())}
                   placeholder='Type RESET to enable'
                   className="bg-card-hover border border-line rounded-lg px-3 py-1.5 text-sm w-44 font-mono focus:outline-none focus:border-red-400" />
            <button onClick={doFactoryReset} disabled={resetText !== 'RESET' || resetting}
                    className="px-4 py-1.5 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center gap-2">
              {resetting && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-0.5">{label}</div>
      <div className="text-sm text-gray-200">{value}</div>
    </div>
  )
}

function SignalBars({ bars }) {
  return (
    <div className="flex items-end gap-0.5 h-4">
      {[1, 2, 3, 4].map((n) => (
        <span key={n}
              className={`w-1 rounded-sm ${n <= bars ? 'bg-emerald-400' : 'bg-line'}`}
              style={{ height: `${n * 25}%` }} />
      ))}
    </div>
  )
}
