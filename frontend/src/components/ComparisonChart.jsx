import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Devices, Aggregate } from '../lib/api'
import EmptyState from './EmptyState'

const VIEWS = [
  { id: 'hourly', label: 'Hourly avg' },
  { id: 'daily', label: 'Daily total' },
  { id: 'weekly', label: 'Weekday avg' },
]

const ECO = '#10b981'
const FULL = '#f59e0b'
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function ComparisonChart({ deviceId }) {
  const [view, setView] = useState('hourly')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    const params = { from: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(), limit: 50000 }
    const p = deviceId === 'all' ? Aggregate.readings(params) : Devices.readings(deviceId, params)
    p.then((data) => { if (!cancel) setRows(data) })
     .catch(() => { if (!cancel) setRows([]) })
     .finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [deviceId])

  const data = useMemo(() => buildSeries(rows, view), [rows, view])
  const hasBoth = useMemo(() =>
    rows.some((r) => r.mode === 'ECO') && rows.some((r) => r.mode === 'FULL'),
    [rows])

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">ECO vs FULL</h2>
        <div className="flex gap-1 bg-card-hover rounded-lg p-1">
          {VIEWS.map((v) => (
            <button key={v.id} onClick={() => setView(v.id)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      view === v.id ? 'bg-primary text-white' : 'text-gray-400 hover:text-gray-200'
                    }`}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-64 skeleton rounded-lg" />
      ) : !hasBoth ? (
        <EmptyState icon="🔁" title="Need data in both modes"
                    hint="Toggle ECO and FULL across the day to see how they compare." />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis dataKey="x" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false}
                   unit={view === 'daily' ? ' kWh' : ' W'} width={55} />
            <Tooltip contentStyle={{ backgroundColor: '#12121a', border: '1px solid #1e1e2e', borderRadius: 8 }}
                     labelStyle={{ color: '#9ca3af', fontSize: 12 }} itemStyle={{ fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    formatter={(v) => <span style={{ color: '#9ca3af' }}>{v}</span>} />
            <Bar dataKey="ECO" fill={ECO} radius={[4, 4, 0, 0]} />
            <Bar dataKey="FULL" fill={FULL} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function buildSeries(rows, view) {
  if (!rows.length) return []
  if (view === 'hourly') {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ x: `${h}h`, ECO: { sum: 0, n: 0 }, FULL: { sum: 0, n: 0 } }))
    for (const r of rows) {
      const h = new Date(r.timestamp).getHours()
      const k = r.mode === 'ECO' ? 'ECO' : 'FULL'
      buckets[h][k].sum += r.power_watts || 0
      buckets[h][k].n += 1
    }
    return buckets.map((b) => ({
      x: b.x,
      ECO: b.ECO.n ? b.ECO.sum / b.ECO.n : 0,
      FULL: b.FULL.n ? b.FULL.sum / b.FULL.n : 0,
    }))
  }
  if (view === 'weekly') {
    const buckets = Array.from({ length: 7 }, (_, i) => ({ x: DAYS[i], ECO: { sum: 0, n: 0 }, FULL: { sum: 0, n: 0 } }))
    for (const r of rows) {
      const d = new Date(r.timestamp).getDay()
      const k = r.mode === 'ECO' ? 'ECO' : 'FULL'
      buckets[d][k].sum += r.power_watts || 0
      buckets[d][k].n += 1
    }
    return buckets.map((b) => ({
      x: b.x,
      ECO: b.ECO.n ? b.ECO.sum / b.ECO.n : 0,
      FULL: b.FULL.n ? b.FULL.sum / b.FULL.n : 0,
    }))
  }
  // daily total kWh by mode (rough — sum of per-reading watts × interval inferred from gaps)
  const byDay = new Map()
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const next = rows[i + 1]
    const dt = next ? Math.max(0, (new Date(next.timestamp) - new Date(r.timestamp)) / 3600000) : 0
    const kwh = (r.power_watts || 0) / 1000 * dt
    const day = r.timestamp.slice(0, 10)
    const k = r.mode === 'ECO' ? 'ECO' : 'FULL'
    const cur = byDay.get(day) || { x: day, ECO: 0, FULL: 0 }
    cur[k] += kwh
    byDay.set(day, cur)
  }
  return Array.from(byDay.values()).slice(-30)
}
