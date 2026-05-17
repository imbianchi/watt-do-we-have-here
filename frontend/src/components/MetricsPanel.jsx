import { useEffect, useState, useMemo } from 'react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Devices, Aggregate } from '../lib/api'
import { fmtKwh, fmtCost, fmtW } from '../lib/format'
import { useLocalStorage, useTween } from '../lib/hooks'
import { CardSkeleton } from './Skeleton'
import EmptyState from './EmptyState'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'costs', label: 'Costs' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'co2', label: 'CO₂' },
]

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const PRIMARY = '#6366f1'
const YEAR_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

function fmtMonthLong(key) {
  if (!key) return ''
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' })
}
function fmtMonthShort(key) {
  if (!key) return ''
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString([], { month: 'short', year: '2-digit' })
}
function pctDelta(current, prior) {
  if (prior == null || prior <= 0 || current == null) return null
  return ((current - prior) / prior) * 100
}

export default function MetricsPanel({ deviceId, currentWatts = 0, onPriceChange }) {
  const [tab, setTab] = useLocalStorage('wd:metricsTab', 'overview')
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(false)
  const [pricePerKwh, setPricePerKwh] = useLocalStorage('wd:pricePerKwh', 0.22)
  const [inputPrice, setInputPrice] = useState(String(pricePerKwh))
  const [costAccum, setCostAccum] = useState(0)

  useEffect(() => {
    setInsights(null)
    setLoading(true)
    const p = deviceId === 'all'
      ? Aggregate.insights({ price_per_kwh: pricePerKwh })
      : Devices.insights(deviceId, { price_per_kwh: pricePerKwh })
    p.then(setInsights).catch(() => setInsights(null)).finally(() => setLoading(false))
  }, [deviceId, pricePerKwh])

  useEffect(() => {
    setCostAccum(0)
    const start = Date.now()
    const id = setInterval(() => {
      const elapsedH = (Date.now() - start) / 3600000
      setCostAccum((currentWatts / 1000) * elapsedH * pricePerKwh)
    }, 1000)
    return () => clearInterval(id)
  }, [currentWatts, pricePerKwh])

  const applyPrice = () => {
    const v = parseFloat(inputPrice)
    if (!isNaN(v) && v > 0) {
      setPricePerKwh(v)
      onPriceChange?.(v)
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Insights</h2>
        <div role="tablist" aria-label="Insights sections" className="flex gap-1 bg-card-hover rounded-lg p-1">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors active:scale-95 ${
                      tab === t.id ? 'bg-primary text-white' : 'text-gray-400 hover:text-gray-200'
                    }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <CardSkeleton lines={5} /> : !insights ? (
        <EmptyState icon="📊" title="No insights yet" hint="The collector needs more data points." />
      ) : (
        <>
          {tab === 'overview' && (
            <Overview insights={insights} currentWatts={currentWatts} costAccum={costAccum} />
          )}
          {tab === 'costs' && (
            <Costs insights={insights} deviceId={deviceId} pricePerKwh={pricePerKwh}
                   inputPrice={inputPrice} setInputPrice={setInputPrice}
                   applyPrice={applyPrice} currentWatts={currentWatts} />
          )}
          {tab === 'patterns' && <Patterns insights={insights} />}
          {tab === 'co2' && <Co2 insights={insights} />}
        </>
      )}
    </div>
  )
}

// ---------- Overview ----------
function Overview({ insights, currentWatts, costAccum }) {
  const ecoVsFull = computeDelta(insights.avg_power_eco, insights.avg_power_full)
  const tweenedCost = useTween(costAccum, 200)
  const tweenedRate = useTween(currentWatts, 500)

  const todayDelta = pctDelta(insights.total_kwh_today, insights.today_kwh_last_month)
  const monthDelta = pctDelta(insights.total_kwh_month, insights.month_to_date_kwh_last_month)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Kpi label="Today" value={fmtKwh(insights.total_kwh_today, 3)}
               delta={todayDelta} />
          <Kpi label="This month" value={fmtKwh(insights.total_kwh_month, 2)}
               delta={monthDelta} />
          <Kpi label="All time" value={fmtKwh(insights.total_kwh, 2)} />
          <Kpi label="Current rate" value={fmtW(tweenedRate)} />
        </div>

        {/* Streak + Best/Worst day */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-card-hover rounded-xl p-3 border border-primary/30">
            <div className="text-xs uppercase tracking-wider text-gray-500 font-sans">📈 Streak</div>
            <div className="font-mono font-bold text-2xl text-primary tabular-nums">{insights.days_of_data || 0}</div>
            <div className="text-[10px] text-gray-600">days of data</div>
          </div>
          <DayCard label="Best day" emoji="🌱" color="text-emerald-400"
                   day={insights.best_day} />
          <DayCard label="Worst day" emoji="⚠️" color="text-red-400"
                   day={insights.worst_day} />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-2">ECO vs FULL average</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left pb-2 font-medium text-gray-400">Mode</th>
                <th className="text-right pb-2 font-medium text-gray-400">Avg power</th>
                <th className="text-right pb-2 font-medium text-gray-400">Δ</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line/50">
                <td className="py-2"><Dot color="#10b981" /> <span className="text-emerald-400">ECO</span></td>
                <td className="text-right py-2 font-mono tabular-nums">{insights.avg_power_eco != null ? `${insights.avg_power_eco.toFixed(1)} W` : '—'}</td>
                <td className="text-right py-2 text-gray-500">{ecoVsFull?.from === 'eco' ? `${ecoVsFull.pct.toFixed(0)}%` : '—'}</td>
              </tr>
              <tr>
                <td className="py-2"><Dot color="#f59e0b" /> <span className="text-amber-400">FULL</span></td>
                <td className="text-right py-2 font-mono tabular-nums">{insights.avg_power_full != null ? `${insights.avg_power_full.toFixed(1)} W` : '—'}</td>
                <td className="text-right py-2 text-gray-500">{ecoVsFull?.from === 'full' ? `${ecoVsFull.pct.toFixed(0)}%` : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="card bg-card-hover p-4">
          <div className="text-xs uppercase tracking-widest text-gray-500 mb-1">Live cost ticker</div>
          <div className="text-2xl font-mono text-emerald-400 tabular-nums">{fmtCost(tweenedCost, '€')}</div>
          <div className="text-xs text-gray-500 mt-1">accumulated since panel opened</div>
        </div>
      </div>
    </div>
  )
}

function DayCard({ label, emoji, color, day }) {
  if (!day) return (
    <div className="bg-card-hover rounded-xl p-3 border border-line">
      <div className="text-xs uppercase tracking-wider text-gray-500 font-sans">{emoji} {label}</div>
      <div className="font-mono text-gray-600 text-base mt-1">—</div>
    </div>
  )
  return (
    <div className="bg-card-hover rounded-xl p-3 border border-line">
      <div className="text-xs uppercase tracking-wider text-gray-500 font-sans">{emoji} {label}</div>
      <div className={`font-mono font-bold text-xl tabular-nums ${color} mt-1`}>{day.kwh.toFixed(3)} kWh</div>
      <div className="text-[10px] text-gray-500">{day.day}</div>
    </div>
  )
}

// ---------- Costs ----------
function Costs({ insights, deviceId, pricePerKwh, inputPrice, setInputPrice, applyPrice, currentWatts }) {
  const currentMonthKey = new Date().toISOString().slice(0, 7)
  const [selectedMonth, setSelectedMonth] = useLocalStorage('wd:costsMonth', currentMonthKey)
  const [monthOverride, setMonthOverride] = useState(null)
  const [monthLoading, setMonthLoading] = useState(false)

  const months = useMemo(() => {
    const arr = (insights.monthly_kwh || []).slice().reverse()
    // ensure currentMonthKey appears even with no data yet
    if (!arr.find((m) => m.month === currentMonthKey)) {
      arr.unshift({ month: currentMonthKey, kwh: insights.total_kwh_month || 0 })
    }
    return arr
  }, [insights, currentMonthKey])

  const isCurrent = selectedMonth === currentMonthKey

  // Fetch readings for a past month when selected
  useEffect(() => {
    if (isCurrent) { setMonthOverride(null); return }
    const [y, m] = selectedMonth.split('-').map(Number)
    const from = new Date(y, m - 1, 1).toISOString()
    const to = new Date(y, m, 0, 23, 59, 59).toISOString()
    setMonthLoading(true)
    const promise = deviceId === 'all'
      ? Aggregate.readings({ from, to, limit: 50000 })
      : Devices.readings(deviceId, { from, to, limit: 50000 })
    promise.then((rows) => {
      const byDay = {}
      for (const r of rows) {
        const day = r.timestamp.slice(0, 10)
        if (!byDay[day]) byDay[day] = { min: r.total_kwh, max: r.total_kwh }
        else {
          if (r.total_kwh < byDay[day].min) byDay[day].min = r.total_kwh
          if (r.total_kwh > byDay[day].max) byDay[day].max = r.total_kwh
        }
      }
      const daily = Object.entries(byDay)
        .map(([day, v]) => ({ day, kwh: Math.max(0, v.max - v.min) }))
        .sort((a, b) => a.day.localeCompare(b.day))
      setMonthOverride({ daily, kwh: daily.reduce((s, d) => s + d.kwh, 0) })
    }).catch(() => setMonthOverride(null)).finally(() => setMonthLoading(false))
  }, [selectedMonth, deviceId, isCurrent])

  const monthKwh = isCurrent ? insights.total_kwh_month : (monthOverride?.kwh ?? 0)
  const dailyData = (isCurrent ? insights.daily_kwh || [] : monthOverride?.daily || [])
    .map((d) => ({ x: d.day.slice(5), kwh: d.kwh, cost: d.kwh * pricePerKwh }))

  const projected = (currentWatts / 1000) * 24 * 30 * pricePerKwh

  const cheapest = [...(insights.peak_hours || [])]
    .reduce((acc, p) => {
      const cur = acc[p.hour] || { hour: p.hour, sum: 0, n: 0 }
      cur.sum += p.avg_power || 0; cur.n += 1
      acc[p.hour] = cur
      return acc
    }, {})
  const cheapHours = Object.values(cheapest)
    .map((c) => ({ hour: c.hour, avg: c.n ? c.sum / c.n : 0 }))
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 3)

  const tweenedMonth = useTween(monthKwh * pricePerKwh, 600)
  const tweenedProjected = useTween(projected, 600)

  // Year-over-year
  const yearsWithData = useMemo(() => {
    const s = new Set((insights.monthly_kwh || []).map((m) => m.month.slice(0, 4)))
    return [...s].sort()
  }, [insights])
  const showYoy = yearsWithData.length >= 2
  const yoyData = useMemo(() => {
    if (!showYoy) return []
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return monthNames.map((name, i) => {
      const row = { x: name }
      for (const y of yearsWithData) {
        const m = `${y}-${String(i + 1).padStart(2, '0')}`
        const data = insights.monthly_kwh.find((x) => x.month === m)
        row[y] = data?.kwh || 0
      }
      return row
    })
  }, [insights, yearsWithData, showYoy])

  return (
    <div className="flex flex-col gap-5">
      {/* Month selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs uppercase tracking-widest text-gray-500">Month</label>
        <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-card-hover border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary">
          {months.map((m) => (
            <option key={m.month} value={m.month}>
              {fmtMonthLong(m.month)}{m.month === currentMonthKey ? ' (current)' : ''}
            </option>
          ))}
        </select>
        {monthLoading && <span className="text-xs text-gray-500">loading…</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-3">
            Cost per day · {isCurrent ? 'last 30 days' : fmtMonthLong(selectedMonth)}
          </h3>
          {dailyData.length === 0 ? (
            <EmptyState icon="📅" title="No daily data" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="x" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} unit=" €" />
                <Tooltip contentStyle={{ backgroundColor: '#12121a', border: '1px solid #1e1e2e', borderRadius: 8 }} />
                <Bar dataKey="cost" fill={PRIMARY} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-2">Price per kWh</h3>
            <div className="flex gap-2 items-center">
              <input type="number" step="0.01" min="0" value={inputPrice}
                     onChange={(e) => setInputPrice(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && applyPrice()}
                     className="bg-card-hover border border-line rounded-lg px-3 py-1.5 text-sm w-28 font-mono focus:outline-none focus:border-primary" />
              <button onClick={applyPrice}
                      className="px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dim active:scale-95 transition-all">
                Apply
              </button>
            </div>
          </div>
          <Kpi label={isCurrent ? 'Estimated this month' : `${fmtMonthLong(selectedMonth)} cost`}
               value={fmtCost(tweenedMonth)} big />
          {isCurrent && (
            <Kpi label="Projected (at current rate)" value={fmtCost(tweenedProjected)}
                 hint="watts × 24 × 30 × €/kWh" />
          )}
          <div>
            <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-2">Cheapest hours to run</h3>
            <div className="flex gap-2">
              {cheapHours.length === 0 ? <span className="text-gray-500 text-sm">—</span> :
                cheapHours.map((c) => (
                  <div key={c.hour} className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2 text-center">
                    <div className="text-emerald-400 font-mono text-lg">{String(c.hour).padStart(2, '0')}h</div>
                    <div className="text-[10px] text-emerald-300/60">{Math.round(c.avg)}W</div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      </div>

      {/* Year-over-year — only when multiple years present */}
      {showYoy && (
        <div>
          <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-3">Year-over-year · monthly kWh</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={yoyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis dataKey="x" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} unit=" kWh" />
              <Tooltip contentStyle={{ backgroundColor: '#12121a', border: '1px solid #1e1e2e', borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => <span style={{ color: '#9ca3af' }}>{v}</span>} />
              {yearsWithData.map((y, i) => (
                <Bar key={y} dataKey={y} fill={YEAR_COLORS[i % YEAR_COLORS.length]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ---------- Patterns ----------
function Patterns({ insights }) {
  const peak = insights.peak_hours || []
  const heatmap = useMemo(() => {
    const m = {}
    for (const p of peak) m[`${p.weekday}-${p.hour}`] = p.avg_power
    return m
  }, [peak])
  const maxPower = useMemo(() => Math.max(1, ...peak.map((p) => p.avg_power || 0)), [peak])

  const hourlyAvg = HOURS.map((h) => {
    const same = peak.filter((p) => p.hour === h)
    const avg = same.length ? same.reduce((s, p) => s + (p.avg_power || 0), 0) / same.length : 0
    return { h, avg }
  })
  const top3 = [...hourlyAvg].sort((a, b) => b.avg - a.avg).slice(0, 3)

  const daily = DAYS.map((label, wd) => {
    const same = peak.filter((p) => p.weekday === wd)
    const avg = same.length ? same.reduce((s, p) => s + (p.avg_power || 0), 0) / same.length : 0
    return { label, avg }
  })
  const heaviestDay = [...daily].sort((a, b) => b.avg - a.avg)[0]

  // Month-over-month series
  const momData = (insights.monthly_kwh || []).map((m) => ({ x: fmtMonthShort(m.month), kwh: m.kwh }))

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-3">Heatmap — hour × weekday</h3>
          <div className="overflow-x-auto">
            <div className="grid gap-1" style={{ gridTemplateColumns: 'auto repeat(24, minmax(0, 1fr))' }}>
              <div />
              {HOURS.map((h) => (
                <div key={`hd-${h}`} className="text-center text-gray-600" style={{ fontSize: 9 }}>{h}</div>
              ))}
              {DAYS.map((day, wd) => (
                <Row key={`row-${wd}`} day={day} wd={wd} heatmap={heatmap} maxPower={maxPower} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-gray-600">Low</span>
            <div className="flex-1 h-2 rounded"
                 style={{ background: 'linear-gradient(to right, #1e1e2e, #6366f1, #f59e0b, #ef4444)' }} />
            <span className="text-xs text-gray-600">High</span>
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-2">Top 3 peak hours</h3>
            <div className="flex gap-2">
              {top3.map((t, i) => (
                <div key={i} className="flex-1 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-center">
                  <div className="text-amber-400 font-mono text-lg">{String(t.h).padStart(2, '0')}h</div>
                  <div className="text-[10px] text-amber-300/60">{Math.round(t.avg)}W avg</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-2">By day of week</h3>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} unit=" W" />
                <Tooltip contentStyle={{ backgroundColor: '#12121a', border: '1px solid #1e1e2e', borderRadius: 8 }} />
                <Bar dataKey="avg" fill={PRIMARY} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {heaviestDay && (
              <div className="text-xs text-gray-500 mt-1">
                Heaviest: <span className="text-gray-300">{heaviestDay.label}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-3">Month-over-month consumption</h3>
        {momData.length === 0 ? (
          <EmptyState icon="📅" title="Not enough months yet"
                      hint="Two or more months of data unlock month-over-month comparison." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={momData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis dataKey="x" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} unit=" kWh" />
              <Tooltip contentStyle={{ backgroundColor: '#12121a', border: '1px solid #1e1e2e', borderRadius: 8 }} />
              <Bar dataKey="kwh" fill={PRIMARY} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function Row({ day, wd, heatmap, maxPower }) {
  return (
    <>
      <div className="text-right pr-1 text-gray-500 flex items-center justify-end" style={{ fontSize: 10 }}>{day}</div>
      {HOURS.map((h) => {
        const v = heatmap[`${wd}-${h}`] ?? 0
        const intensity = Math.min(v / maxPower, 1)
        const r = Math.round(intensity * 239)
        const g = Math.round((1 - Math.abs(intensity - 0.5) * 2) * 158)
        const b = Math.round((1 - intensity) * 100 + intensity * 11)
        const bg = v > 0 ? `rgb(${r},${g},${b})` : '#1e1e2e'
        return (
          <div key={`c-${wd}-${h}`}
               title={`${day} ${String(h).padStart(2, '0')}:00 · ${Math.round(v)} W`}
               style={{ backgroundColor: bg }}
               className="rounded aspect-square cursor-default transition-transform hover:scale-110" />
        )
      })}
    </>
  )
}

// ---------- CO₂ ----------
function Co2({ insights }) {
  const co2 = insights.co2_kg || 0
  const km = co2 / 0.12
  const trees = co2 / 21
  const ecoCo2 = (insights.avg_power_eco || 0) * 24 * 30 / 1000 * 0.25
  const fullCo2 = (insights.avg_power_full || 0) * 24 * 30 / 1000 * 0.25
  const tweenedCo2 = useTween(co2, 600)
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="CO₂ this month" value={`${tweenedCo2.toFixed(2)} kg`} accent="emerald" big />
        <Kpi label="≈ km driven" value={`${km.toFixed(0)} km`} hint="120 g CO₂/km avg car" />
        <Kpi label="≈ trees / year" value={trees.toFixed(2)} hint="21 kg/tree absorbed yearly" />
        <Kpi label="Grid intensity" value="0.25 kg/kWh" hint="Portuguese grid" />
      </div>
      <div>
        <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-3">ECO vs FULL · CO₂ if always on (30d)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={[{ name: 'ECO', value: ecoCo2 }, { name: 'FULL', value: fullCo2 }]}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} unit=" kg" />
            <Tooltip contentStyle={{ backgroundColor: '#12121a', border: '1px solid #1e1e2e', borderRadius: 8 }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              <Cell fill="#10b981" />
              <Cell fill="#f59e0b" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ---------- helpers ----------
function Kpi({ label, value, hint, big, accent, delta }) {
  const valColor = accent === 'emerald' ? 'text-emerald-400' : 'text-gray-100'
  return (
    <div className="bg-card-hover rounded-xl p-3 flex flex-col gap-0.5 transition-colors hover:bg-line">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span className={`font-mono tabular-nums ${big ? 'text-2xl' : 'text-lg'} font-semibold ${valColor}`}>{value}</span>
      {delta != null && <DeltaPill delta={delta} />}
      {hint && <span className="text-[10px] text-gray-600">{hint}</span>}
    </div>
  )
}

export function DeltaPill({ delta, compact = false }) {
  if (delta == null) return null
  const up = delta > 0
  const color = up ? 'text-red-400' : 'text-emerald-400'
  return (
    <span className={`text-[10px] font-mono tabular-nums ${color} ${compact ? '' : 'mt-0.5'}`}>
      {up ? '▲' : '▼'} {up ? '+' : ''}{delta.toFixed(0)}% vs last month
    </span>
  )
}

function Dot({ color }) {
  return <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: color }} />
}

function computeDelta(eco, full) {
  if (eco == null || full == null || eco === 0 || full === 0) return null
  if (eco < full) return { from: 'eco', pct: ((full - eco) / full) * 100 }
  return { from: 'full', pct: ((eco - full) / eco) * 100 }
}
