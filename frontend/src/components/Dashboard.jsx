import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Devices, Aggregate, Auth } from '../lib/api'
import { fmtKwh, fmtUptime, relativeTime } from '../lib/format'
import { DeltaPill } from './MetricsPanel'
import { useLocalStorage, usePolling, useTick, useTween } from '../lib/hooks'
import { useToast } from '../lib/toast'
import { getStoredUser, removeToken, setStoredUser } from '../lib/auth'
import DeviceSelector from './DeviceSelector'
import AddDeviceModal from './AddDeviceModal'
import ControlPanel from './ControlPanel'
import PowerGauge from './PowerGauge'
import EnergyChart from './EnergyChart'
import ComparisonChart from './ComparisonChart'
import MetricsPanel from './MetricsPanel'
import AlertsPanel from './AlertsPanel'
import SchedulesTab from './SchedulesTab'
import WebhooksTab from './WebhooksTab'
import ScriptsTab from './ScriptsTab'
import SettingsTab from './SettingsTab'
import EmptyState from './EmptyState'
import { CardSkeleton } from './Skeleton'

const STATUS_INTERVAL = 5000
const INSIGHTS_INTERVAL = 30000
const READINGS_INTERVAL = 30000

export default function Dashboard() {
  const toast = useToast()
  const navigate = useNavigate()
  const [me, setMe] = useState(getStoredUser())

  useEffect(() => {
    if (!me) {
      Auth.me().then((u) => { setStoredUser(u); setMe(u) }).catch(() => {})
    }
  }, [me])

  const onLogout = () => {
    removeToken()
    navigate('/login')
  }

  const [devices, setDevices] = useState([])
  const [agg, setAgg] = useState(null)
  const [insights, setInsights] = useState(null)
  const [readings1h, setReadings1h] = useState([])
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [bootstrapped, setBootstrapped] = useState(false)
  const [loadingPanels, setLoadingPanels] = useState(false)

  // Persisted prefs
  const [selectedId, setSelectedId] = useLocalStorage('wd:selectedDevice', 'all')
  const [pricePerKwh, setPricePerKwh] = useLocalStorage('wd:pricePerKwh', 0.22)

  // Tick to refresh "Xs ago" labels
  useTick(1000)

  const refreshDevicesAndAggregate = async () => {
    try {
      const [list, aggregate] = await Promise.all([Devices.list(), Aggregate.status()])
      setDevices(list)
      setAgg(aggregate)
      setError(null)
      setLastUpdated(new Date())
      if (!bootstrapped) {
        setBootstrapped(true)
        // Migrate persisted ID if device no longer exists
        if (selectedId !== 'all' && !list.find((d) => d.id === selectedId)) {
          setSelectedId(list.length === 1 ? list[0].id : 'all')
        }
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Backend unreachable')
    }
  }

  const refreshInsights = async () => {
    try {
      const data = selectedId === 'all'
        ? await Aggregate.insights({ price_per_kwh: pricePerKwh })
        : await Devices.insights(selectedId, { price_per_kwh: pricePerKwh })
      setInsights(data)
    } catch { setInsights(null) }
  }

  const refresh1h = async () => {
    if (selectedId === 'all') { setReadings1h([]); return }
    try {
      const from = new Date(Date.now() - 3600 * 1000).toISOString()
      const r = await Devices.readings(selectedId, { from, limit: 200 })
      setReadings1h(r)
    } catch { setReadings1h([]) }
  }

  // Live status — every 5s, visibility-aware
  usePolling(refreshDevicesAndAggregate, STATUS_INTERVAL, [])

  // Slower data — only when device or price changes
  usePolling(refreshInsights, INSIGHTS_INTERVAL, [selectedId, pricePerKwh])
  usePolling(refresh1h, READINGS_INTERVAL, [selectedId])

  // Reset transient state on device switch + show skeletons until insights arrive
  useEffect(() => {
    setInsights(null)
    setReadings1h([])
    setLoadingPanels(true)
    const t = setTimeout(() => setLoadingPanels(false), 250)
    return () => clearTimeout(t)
  }, [selectedId])

  const selected = useMemo(() => devices.find((d) => d.id === selectedId), [devices, selectedId])
  const status = selected?.status
  const oneHourAgo = readings1h.length ? readings1h[0].power_watts : null
  const activeAlerts = devices.filter((d) => d.active_alert).length

  const onDeviceAdded = (d) => {
    setShowAdd(false)
    setSelectedId(d.id)
    refreshDevicesAndAggregate()
  }

  // Surface backend errors as toasts (once per error change)
  useEffect(() => {
    if (error) toast(error, 'error', 3000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])

  return (
    <div className="min-h-screen bg-app text-gray-100 p-4 md:p-6 lg:p-8">
      <Header
        lastUpdated={lastUpdated}
        connected={!error}
        agg={agg}
        activeAlerts={activeAlerts}
        user={me}
        onLogout={onLogout}
      />

      <section className="mb-6">
        <DeviceSelector
          devices={devices}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAdd={() => setShowAdd(true)}
        />
      </section>

      {selectedId === 'all' ? (
        <AggregateView
          agg={agg}
          insights={insights}
          loading={loadingPanels}
          pricePerKwh={pricePerKwh}
          setPricePerKwh={setPricePerKwh}
        />
      ) : !selected ? (
        devices.length === 0 ? (
          <div className="card p-8">
            <EmptyState icon="🔌" title="No devices yet"
                        hint="Add your first Shelly to start monitoring." />
            <div className="flex justify-center mt-2">
              <button onClick={() => setShowAdd(true)}
                      className="px-5 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-dim active:scale-95 transition-all">
                + Add device
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6">
            <CardSkeleton lines={6} />
            <CardSkeleton lines={4} />
          </div>
        )
      ) : (
        <SingleDeviceView
          device={selected}
          status={status}
          insights={insights}
          oneHourAgo={oneHourAgo}
          pricePerKwh={pricePerKwh}
          setPricePerKwh={setPricePerKwh}
          loading={loadingPanels}
          onChange={refreshDevicesAndAggregate}
        />
      )}

      <AddDeviceModal isOpen={showAdd} onClose={() => setShowAdd(false)} onSuccess={onDeviceAdded} />

      <footer className="mt-10 text-center text-xs text-gray-600">
        Multi-device Shelly monitor · Watt Do We Have Here
      </footer>
    </div>
  )
}

function Header({ lastUpdated, connected, agg, activeAlerts, user, onLogout }) {
  const totalW = useTween(agg?.total_power_watts || 0, 600)
  const ago = lastUpdated ? relativeTime(lastUpdated) : null
  return (
    <header className="mb-6 flex items-start md:items-center justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-yellow-400 flex items-center gap-2">
          ⚡ Watt Do We Have Here
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Home energy monitor · Shelly fleet</p>
      </div>
      <div className="flex items-center gap-4 text-xs">
        {agg && (
          <div className="hidden md:flex items-center gap-3 text-gray-400 border-r border-line pr-4">
            <span className="font-mono text-emerald-400 tabular-nums">{Math.round(totalW)} W</span>
            <span>{agg.devices_on}/{agg.device_count} on</span>
          </div>
        )}
        {activeAlerts > 0 && (
          <span className="bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded-full px-2.5 py-0.5 font-medium">
            ⚠ {activeAlerts} alert{activeAlerts > 1 ? 's' : ''}
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-gray-400">{connected ? 'Connected' : 'Offline'}</span>
        </div>
        {ago && (
          <span className="text-gray-500" title={lastUpdated.toLocaleString()}>{ago}</span>
        )}
        {user && <UserMenu user={user} onLogout={onLogout} />}
      </div>
    </header>
  )
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const initials = (user.name || user.email || '?')
    .split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-card-hover transition-colors"
              aria-haspopup="menu" aria-expanded={open}>
        <span className="w-7 h-7 rounded-full bg-primary/20 border border-primary/40 text-primary text-xs font-semibold flex items-center justify-center">
          {initials}
        </span>
        <span className="hidden sm:inline text-gray-300 font-medium">{user.name}</span>
        <span className="text-gray-500">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-56 card p-2 z-50 animate-[fadeIn_120ms_ease-out]">
          <div className="px-3 py-2 border-b border-line mb-1">
            <div className="text-sm text-gray-100 truncate">{user.name}</div>
            <div className="text-xs text-gray-500 truncate">{user.email}</div>
          </div>
          <button onClick={onLogout}
                  className="w-full text-left px-3 py-2 rounded text-sm text-red-400 hover:bg-red-500/10 transition-colors">
            Sign out
          </button>
          <style>{`@keyframes fadeIn { from { opacity:0; transform: translateY(-4px) } to { opacity:1; transform: translateY(0) } }`}</style>
        </div>
      )}
    </div>
  )
}

function AggregateView({ agg, insights, loading, pricePerKwh, setPricePerKwh }) {
  const total = useTween(agg?.total_power_watts ?? 0, 600)
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Big label="Total live power" value={`${Math.round(total)} W`} accent="emerald" mono />
        <Big label="Devices on" value={agg ? `${agg.devices_on}/${agg.device_count}` : '—'} />
        <Big label="Today (combined)" value={fmtKwh(insights?.total_kwh_today, 3)} mono />
        <Big label="This month (combined)" value={fmtKwh(insights?.total_kwh_month, 2)} mono />
      </div>
      {agg?.devices?.length > 0 && (
        <div className="card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4">All devices</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {agg.devices.map((d) => (
              <div key={d.id} className="bg-card-hover rounded-xl p-3 border border-line transition-all hover:bg-line">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-200">{d.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    d.status?.switch_state ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-700/50 text-gray-500'
                  }`}>
                    {d.status?.switch_state ? 'ON' : 'OFF'}
                  </span>
                </div>
                <div className="font-mono text-lg text-gray-100 tabular-nums">
                  {Math.round(d.status?.power_watts || 0)} W
                </div>
                <div className="text-[10px] text-gray-500">
                  {d.status?.mode || '—'} · {d.location || 'no location'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {loading ? <CardSkeleton lines={5} /> : <EnergyChart deviceId="all" pricePerKwh={pricePerKwh} />}
      {loading ? <CardSkeleton lines={4} /> : (
        <MetricsPanel deviceId="all" currentWatts={total} onPriceChange={setPricePerKwh} />
      )}
    </div>
  )
}

const DEVICE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'schedules', label: 'Schedules' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'settings', label: 'Settings' },
]

function DeviceTabBar({ tab, setTab }) {
  return (
    <div role="tablist" aria-label="Device sections"
         className="flex gap-1 bg-card border border-line rounded-xl p-1 overflow-x-auto">
      {DEVICE_TABS.map((t) => (
        <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                className={`flex-1 min-w-[88px] px-3 py-1.5 rounded-lg text-sm font-medium transition-colors active:scale-95 ${
                  tab === t.id ? 'bg-primary text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-card-hover'
                }`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

function ComingSoon({ icon, name }) {
  return (
    <div className="card p-8 text-center text-gray-500">
      <div className="text-4xl mb-2 opacity-60">{icon}</div>
      <div className="font-medium text-gray-300">{name}</div>
      <div className="text-xs mt-1">Coming in the next section</div>
    </div>
  )
}

function SingleDeviceView({ device, status, insights, oneHourAgo, pricePerKwh, setPricePerKwh, loading, onChange }) {
  const [deviceTab, setDeviceTab] = useLocalStorage('wd:deviceTab', 'overview')
  const watts = status?.power_watts ?? 0
  const tweenedV = useTween(status?.voltage, 500)
  const tweenedA = useTween(status?.current_amps, 500)
  const tweenedKwhTotal = useTween(status?.total_kwh, 500)
  const tweenedToday = useTween(insights?.total_kwh_today, 500)
  const tweenedMonth = useTween(insights?.total_kwh_month, 500)
  const tweenedTemp = useTween(status?.temperature_c, 400)
  const tweenedCost = useTween((watts / 1000) * pricePerKwh, 400)

  // Projected month cost: extrapolate from month-to-date daily average over full month
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysElapsed = Math.max(1, now.getDate())
  const totalKwhMonth = insights?.total_kwh_month ?? 0
  const projectedMonthKwh = (totalKwhMonth / daysElapsed) * daysInMonth
  const tweenedProjMonth = useTween(projectedMonthKwh * pricePerKwh, 500)

  // Same-period-last-month deltas
  const todayDelta = insights && insights.today_kwh_last_month > 0
    ? ((insights.total_kwh_today - insights.today_kwh_last_month) / insights.today_kwh_last_month) * 100
    : null
  const monthDelta = insights && insights.month_to_date_kwh_last_month > 0
    ? ((insights.total_kwh_month - insights.month_to_date_kwh_last_month) / insights.month_to_date_kwh_last_month) * 100
    : null

  return (
    <div className="grid gap-6">
      <DeviceTabBar tab={deviceTab} setTab={setDeviceTab} />

      {deviceTab !== 'overview' && (
        <>
          {deviceTab === 'schedules' && <SchedulesTab deviceId={device.id} />}
          {deviceTab === 'scripts' && <ScriptsTab deviceId={device.id} />}
          {deviceTab === 'webhooks' && <WebhooksTab deviceId={device.id} />}
          {deviceTab === 'settings' && <SettingsTab deviceId={device.id} device={device} />}
        </>
      )}

      {deviceTab === 'overview' && (
        <>
      <ControlPanel device={device} status={status} insights={insights} onChange={onChange} />

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
        <PowerGauge
          watts={watts}
          min={insights?.today_min_watts}
          max={insights?.today_max_watts}
          oneHourAgo={oneHourAgo}
        />
        <div className="grid grid-cols-2 gap-3">
          <MiniCard icon="⚡" label="Voltage"
                    value={status ? `${tweenedV.toFixed(1)} V` : '—'} color="text-blue-400" />
          <MiniCard icon="〜" label="Current"
                    value={status ? `${tweenedA.toFixed(2)} A` : '—'} color="text-indigo-400" />
          <MiniCard icon="📅" label="Today"
                    value={insights ? `${tweenedToday.toFixed(3)} kWh` : '—'}
                    color="text-emerald-400" prominent
                    sub={todayDelta != null ? <DeltaPill delta={todayDelta} compact /> : undefined} />
          <MiniCard icon="🗓️" label="This month"
                    value={insights ? `${tweenedMonth.toFixed(2)} kWh` : '—'}
                    color="text-emerald-300" prominent
                    sub={monthDelta != null ? <DeltaPill delta={monthDelta} compact /> : undefined} />
          <MiniCard icon="∑" label="All time kWh"
                    value={insights ? `${tweenedKwhTotal.toFixed(2)}` : '—'} color="text-gray-300" />
          <MiniCard icon="🌡️" label="Temperature"
                    value={status?.temperature_c != null ? `${tweenedTemp.toFixed(1)}°C` : '—'}
                    color={tempColor(status?.temperature_c)}
                    bar={<TempBar tempC={status?.temperature_c} />} />
          <MiniCard icon="€" label="Cost / hour"
                    value={`€${tweenedCost.toFixed(2)}/h`}
                    sub={`€${tweenedProjMonth.toFixed(2)} est. month`}
                    color="text-yellow-400" />
          <MiniCard icon="⏱️" label="Uptime"
                    value={fmtUptime(status?.uptime)} color="text-gray-400" />
        </div>
      </div>

      {loading ? <CardSkeleton lines={5} /> : <EnergyChart deviceId={device.id} pricePerKwh={pricePerKwh} />}
      {loading ? <CardSkeleton lines={4} /> : <ComparisonChart deviceId={device.id} />}
      {loading ? <CardSkeleton lines={5} /> : (
        <MetricsPanel
          deviceId={device.id}
          currentWatts={watts}
          onPriceChange={setPricePerKwh}
        />
      )}
      {loading ? <CardSkeleton lines={3} /> : <AlertsPanel deviceId={device.id} />}
        </>
      )}
    </div>
  )
}

function MiniCard({ icon, label, value, sub, color, prominent, bar }) {
  return (
    <div
      className={`bg-card border border-white/5 rounded-xl flex flex-col
                  ${prominent ? 'p-4 border-l-2 border-l-indigo-500' : 'p-3'}
                  hover:border-white/10 hover:bg-white/5 transition-all duration-200`}
    >
      <div className="text-xs uppercase tracking-widest text-gray-500 font-sans flex items-center gap-1.5">
        <span aria-hidden="true">{icon}</span>
        <span>{label}</span>
      </div>
      <div className={`mt-1 font-mono font-bold tabular-nums ${prominent ? 'text-3xl' : 'text-2xl'} ${color}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs font-mono text-gray-400">{sub}</div>}
      {bar}
    </div>
  )
}

function TempBar({ tempC }) {
  if (tempC == null) return null
  const pct = Math.min(Math.max(tempC, 0), 100)
  return (
    <div className="mt-2 h-[3px] w-full bg-line rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{
          width: `${pct}%`,
          background: 'linear-gradient(to right, #10b981, #f59e0b, #ef4444)',
        }}
      />
    </div>
  )
}

function tempColor(t) {
  if (t == null) return 'text-gray-500'
  if (t < 50) return 'text-emerald-400'
  if (t < 70) return 'text-amber-400'
  return 'text-red-400'
}

function Big({ label, value, accent, mono }) {
  const cls = accent === 'emerald' ? 'text-emerald-400' : 'text-gray-100'
  return (
    <div className="card p-5 transition-all hover:bg-card-hover">
      <div className="text-xs uppercase tracking-widest text-gray-500">{label}</div>
      <div className={`mt-2 text-2xl tabular-nums ${mono ? 'font-mono' : 'font-semibold'} ${cls}`}>{value}</div>
    </div>
  )
}
