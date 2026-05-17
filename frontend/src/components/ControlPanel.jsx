import { useEffect, useState } from 'react'
import { Devices, Shelly } from '../lib/api'
import { fmtUptime, fmtTemp, iconFor } from '../lib/format'
import { useToast } from '../lib/toast'
import { useTick, useTween } from '../lib/hooks'

const PRESETS = [
  { label: '30m', min: 30 },
  { label: '60m', min: 60 },
  { label: '90m', min: 90 },
  { label: '2h', min: 120 },
  { label: '4h', min: 240 },
]

export default function ControlPanel({ device, status, insights, onChange }) {
  const toast = useToast()
  const [info, setInfo] = useState(null)
  const [loadingSwitch, setLoadingSwitch] = useState(false)
  const [loadingMode, setLoadingMode] = useState(false)
  const [loadingTimer, setLoadingTimer] = useState(false)
  const [customMin, setCustomMin] = useState('')

  const [optSwitch, setOptSwitch] = useState(null)
  const [optMode, setOptMode] = useState(null)

  const switchState = optSwitch != null ? optSwitch : (status?.switch_state ?? false)
  const mode = optMode || status?.mode || 'FULL'
  const tempC = status?.temperature_c

  useTick(1000) // re-render every second for countdown

  useEffect(() => {
    if (optSwitch != null && status?.switch_state === optSwitch) setOptSwitch(null)
  }, [status?.switch_state, optSwitch])
  useEffect(() => {
    if (optMode && status?.mode === optMode) setOptMode(null)
  }, [status?.mode, optMode])

  useEffect(() => {
    if (!device?.id) return
    setInfo(null)
    Devices.info(device.id).then(setInfo).catch(() => setInfo(null))
  }, [device?.id])

  // Timer state — computed from device status
  const timer = computeTimer(status)

  const toggle = async () => {
    if (loadingSwitch) return
    const next = !switchState
    setOptSwitch(next)
    setLoadingSwitch(true)
    try {
      await Devices.switch(device.id, next)
      toast(`${device.name}: ${next ? 'turned ON' : 'turned OFF'}`, 'success')
      setTimeout(onChange, 400)
    } catch (err) {
      setOptSwitch(null)
      toast(err.response?.data?.detail || 'Switch failed', 'error')
    } finally {
      setLoadingSwitch(false)
    }
  }

  const setMode = async (m) => {
    if (m === mode || loadingMode) return
    setOptMode(m)
    setLoadingMode(true)
    try {
      await Devices.setMode(device.id, m)
      toast(`Mode set to ${m}`, 'success', 2500)
      await onChange()
    } catch (err) {
      setOptMode(null)
      toast(err.response?.data?.detail || 'Mode change failed', 'error')
    } finally {
      setLoadingMode(false)
    }
  }

  const startTimer = async (minutes) => {
    if (loadingTimer) return
    setLoadingTimer(true)
    try {
      // Timer toggles state after duration — currently ON → will turn OFF
      await Shelly.setTimer(device.id, { on: switchState, duration_minutes: minutes })
      toast(`Auto-off in ${minutes}m`, 'success', 2500)
      setCustomMin('')
      setTimeout(onChange, 400)
    } catch (err) {
      toast(err.response?.data?.detail || 'Timer failed', 'error')
    } finally {
      setLoadingTimer(false)
    }
  }

  const cancelTimer = async () => {
    setLoadingTimer(true)
    try {
      await Shelly.cancelTimer(device.id)
      toast('Timer cancelled', 'success', 2500)
      setTimeout(onChange, 400)
    } catch (err) {
      toast(err.response?.data?.detail || 'Cancel failed', 'error')
    } finally {
      setLoadingTimer(false)
    }
  }

  const submitCustom = (e) => {
    e.preventDefault()
    const m = parseInt(customMin, 10)
    if (!m || m <= 0) { toast('Enter a positive number of minutes', 'warning'); return }
    startTimer(m)
  }

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{iconFor(device?.icon)}</span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-semibold text-gray-100">{device?.name || '—'}</h2>
              {device?.shelly_model && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-card-hover border border-line text-gray-400">
                  {device.shelly_model}
                  {device.shelly_gen ? ` · Gen${device.shelly_gen}` : ''}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">
              {device?.location || '—'}
              {device?.equipment && ` · ${device.equipment}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-right">
          <span className={`w-2.5 h-2.5 rounded-full ${switchState ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
          <span className="text-xs text-gray-300">{switchState ? 'Running' : 'Standby'}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        {/* On/Off with optional timer arc */}
        <PowerButton
          on={switchState}
          loading={loadingSwitch}
          disabled={!status}
          onClick={toggle}
          timer={timer}
        />

        {/* Mode */}
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-widest text-gray-500">Mode</span>
          <div className="flex gap-2" role="group" aria-label="Operating mode">
            {[
              { k: 'ECO', icon: '🌿', cls: 'bg-emerald-500 border-emerald-600' },
              { k: 'FULL', icon: '⚡', cls: 'bg-amber-500 border-amber-600' },
            ].map(({ k, icon, cls }) => (
              <button
                key={k}
                onClick={() => setMode(k)}
                disabled={loadingMode || !status}
                aria-pressed={mode === k}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all duration-200 active:scale-95 flex items-center gap-1.5
                  ${mode === k
                    ? `${cls} text-white shadow-md`
                    : 'bg-card-hover text-gray-400 border-line hover:bg-line'
                  } ${(loadingMode || !status) ? 'opacity-70 cursor-wait' : 'cursor-pointer'}`}
              >
                <span>{icon}</span>{k}
                {loadingMode && mode === k && (
                  <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin ml-0.5" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Auto-off timer — only when device is ON */}
      {switchState && (
        <div className="mt-6 pt-4 border-t border-line">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-widest text-gray-500">⏲ Auto-off timer</span>
            {timer && (
              <span className="text-xs font-mono text-emerald-400 tabular-nums">
                Auto-off in {fmtCountdown(timer.remainingSec)}
              </span>
            )}
          </div>
          {timer ? (
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">
                Started {fmtCountdown(timer.elapsedSec)} ago · total {Math.round(timer.totalSec / 60)}m
              </div>
              <button onClick={cancelTimer} disabled={loadingTimer}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 border border-red-500/40 text-red-300 hover:bg-red-500/25 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50">
                {loadingTimer && <span className="w-3 h-3 rounded-full border-2 border-red-300/30 border-t-red-300 animate-spin" />}
                Cancel timer
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((p) => (
                <button key={p.label} onClick={() => startTimer(p.min)} disabled={loadingTimer}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-card-hover border border-line text-gray-300 hover:bg-line hover:border-primary/40 active:scale-95 transition-all disabled:opacity-50">
                  {p.label}
                </button>
              ))}
              <form onSubmit={submitCustom} className="flex items-center gap-1.5">
                <input type="number" min="1" max="1440" value={customMin}
                       onChange={(e) => setCustomMin(e.target.value)}
                       placeholder="min" disabled={loadingTimer}
                       className="bg-card-hover border border-line rounded-lg px-2.5 py-1 text-xs text-gray-200 w-20 font-mono focus:outline-none focus:border-primary" />
                <button type="submit" disabled={loadingTimer || !customMin}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary-dim active:scale-95 transition-all disabled:opacity-50">
                  Set
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Device info row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-4 border-t border-line text-xs">
        <Info label="IP" value={<span className="font-mono">{device?.ip || '—'}</span>} />
        <Info label="Uptime" value={fmtUptime(status?.uptime)} />
        <Info label="Temp" value={<TempBadge tempC={tempC} />} />
        <Info label="Firmware" value={info?.ver || info?.fw_id?.split('/')[1]?.split('-')[0] || '—'} />
      </div>
    </div>
  )
}

function PowerButton({ on, loading, disabled, onClick, timer }) {
  const SIZE = 128
  const STROKE = 4
  const R = (SIZE - STROKE) / 2
  const CIRC = 2 * Math.PI * R

  const pct = timer ? Math.max(0, Math.min(1, timer.remainingSec / timer.totalSec)) : 0
  const dash = `${pct * CIRC} ${CIRC}`

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        {timer && (
          <svg className="absolute inset-0 -rotate-90" viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#1e1e2e" strokeWidth={STROKE} />
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
                    stroke="#10b981" strokeWidth={STROKE} strokeLinecap="round"
                    strokeDasharray={dash}
                    style={{ transition: 'stroke-dasharray 1s linear' }} />
          </svg>
        )}
        <button
          onClick={onClick}
          disabled={loading || disabled}
          aria-pressed={on}
          aria-label={`Power ${on ? 'on' : 'off'}, click to ${on ? 'turn off' : 'turn on'}`}
          className={`relative w-28 h-28 rounded-full text-2xl font-bold border-4 transition-all duration-300 active:scale-95
            ${on
              ? 'bg-emerald-500 text-white border-emerald-600 shadow-[0_0_30px_rgba(16,185,129,0.5)] animate-pulse-glow'
              : 'bg-gray-700 text-gray-400 border-gray-600'
            }
            ${(loading || disabled) ? 'opacity-70 cursor-wait' : 'hover:scale-105 cursor-pointer'}`}
        >
          <span className={loading ? 'opacity-40' : ''}>{on ? 'ON' : 'OFF'}</span>
          {loading && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="w-6 h-6 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            </span>
          )}
        </button>
      </div>
      <span className="text-[10px] uppercase tracking-widest text-gray-500">
        {on ? 'Powered' : 'Off'}
      </span>
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

function TempBadge({ tempC }) {
  const tweened = useTween(tempC ?? 0, 400)
  if (tempC == null) return <span className="text-gray-500">—</span>
  const color = tempC >= 70 ? 'text-red-400' : tempC >= 55 ? 'text-amber-400' : 'text-emerald-400'
  return <span className={`font-mono ${color}`}>🌡 {fmtTemp(tweened)}</span>
}

function computeTimer(status) {
  if (!status?.timer_started_at || !status?.timer_duration) return null
  const startedMs = status.timer_started_at * 1000
  const totalSec = status.timer_duration
  const elapsedSec = Math.max(0, (Date.now() - startedMs) / 1000)
  const remainingSec = Math.max(0, totalSec - elapsedSec)
  if (remainingSec <= 0) return null
  return { totalSec, elapsedSec, remainingSec }
}

function fmtCountdown(sec) {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${r}s`
  return `${r}s`
}
