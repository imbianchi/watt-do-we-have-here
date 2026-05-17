import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, ReferenceArea, Brush,
} from 'recharts'
import { Devices, Aggregate } from '../lib/api'
import { downloadCsv, safeFilename } from '../lib/format'
import { useLocalStorage } from '../lib/hooks'
import { useToast } from '../lib/toast'
import EmptyState from './EmptyState'

const RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 24 * 7 },
  { label: '30d', hours: 24 * 30 },
]
const MODES = ['ALL', 'ECO', 'FULL']

const ECO_COLOR = '#10b981'
const FULL_COLOR = '#f59e0b'
const PRIMARY = '#6366f1'
const NIGHT_FILL = '#6366f1'

function fmtTime(iso) {
  const d = new Date(iso)
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function brushTickFmt(iso, hoursSpan) {
  const d = new Date(iso)
  if (hoursSpan < 24) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function EnergyChart({ deviceId, pricePerKwh = 0.22 }) {
  const toast = useToast()
  const [rangeLabel, setRangeLabel] = useLocalStorage('wd:chartRange', '24h')
  const [modeFilter, setModeFilter] = useLocalStorage('wd:chartMode', 'ALL')
  const [threshold, setThreshold] = useLocalStorage('wd:chartThreshold', '')
  const [curveType, setCurveType] = useLocalStorage('wd:chartCurve', 'monotone')
  const range = RANGES.find((r) => r.label === rangeLabel) || RANGES[2]

  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [isCustom, setIsCustom] = useState(false)

  // Compare mode
  const [compareOpen, setCompareOpen] = useState(false)
  const [periodA, setPeriodA] = useState({ from: '', to: '' })
  const [periodB, setPeriodB] = useState({ from: '', to: '' })
  const [compareRows, setCompareRows] = useState(null) // {rowsA, rowsB}

  const fetchReadings = useCallback(async (params) => {
    return deviceId === 'all'
      ? Aggregate.readings(params)
      : Devices.readings(deviceId, params)
  }, [deviceId])

  const fetchData = useCallback(async () => {
    if (compareRows) return
    setLoading(true)
    try {
      const params = {}
      if (isCustom) {
        if (customFrom) params.from = customFrom
        if (customTo) params.to = customTo
      } else {
        params.from = new Date(Date.now() - range.hours * 3600 * 1000).toISOString()
      }
      if (modeFilter !== 'ALL') params.mode = modeFilter

      const rows = await fetchReadings(params)
      setData(rows.map((r) => ({
        time: r.timestamp,
        timeLabel: fmtTime(r.timestamp),
        watts: r.power_watts,
        voltage: r.voltage,
        current: r.current_amps,
        mode: r.mode,
        ecoWatts: r.mode === 'ECO' ? r.power_watts : null,
        fullWatts: r.mode === 'FULL' ? r.power_watts : null,
      })))
    } catch (err) {
      console.error('Chart fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [range.hours, modeFilter, isCustom, customFrom, customTo, fetchReadings, compareRows])

  useEffect(() => { setData([]); setCompareRows(null) }, [deviceId])
  useEffect(() => { if (!compareRows) fetchData() }, [fetchData, compareRows])

  const avgWatts = useMemo(() => {
    if (!data.length) return null
    return data.reduce((s, r) => s + (r.watts || 0), 0) / data.length
  }, [data])

  // Mode bands (only meaningful when ALL)
  const modeBands = useMemo(() => {
    if (modeFilter !== 'ALL' || data.length < 2) return []
    const bands = []
    let start = 0
    for (let i = 1; i <= data.length; i++) {
      if (i === data.length || data[i].mode !== data[start].mode) {
        bands.push({ x1: data[start].timeLabel, x2: data[i - 1].timeLabel, mode: data[start].mode })
        start = i
      }
    }
    return bands
  }, [data, modeFilter])

  // Night tariff bands (22:00-08:00)
  const nightBands = useMemo(() => {
    if (data.length < 2) return []
    const bands = []
    let start = null
    for (let i = 0; i < data.length; i++) {
      const h = new Date(data[i].time).getHours()
      const isNight = h >= 22 || h < 8
      if (isNight && start === null) start = i
      else if (!isNight && start !== null) {
        bands.push({ x1: data[start].timeLabel, x2: data[i - 1].timeLabel })
        start = null
      }
    }
    if (start !== null) bands.push({ x1: data[start].timeLabel, x2: data[data.length - 1].timeLabel })
    return bands
  }, [data])

  // Dynamic dot sizing — only show dots when the view is short enough
  const dotProps = useMemo(() => {
    if (isCustom) {
      if (!customFrom || !customTo) return false
      const h = (new Date(customTo) - new Date(customFrom)) / 3600000
      return h < 2 ? { r: 2.5 } : false
    }
    return range.hours < 2 ? { r: 2.5 } : false
  }, [range.hours, isCustom, customFrom, customTo])

  const showOverlay = modeFilter === 'ALL'
  const thresholdNum = parseFloat(threshold)

  const exportCsv = () => {
    const date = new Date().toISOString().slice(0, 10)
    const name = `energy_${safeFilename(deviceId === 'all' ? 'all' : `device-${deviceId}`)}_${date}.csv`
    downloadCsv(name,
      data.map((r) => ({ time: r.time, watts: r.watts, voltage: r.voltage, current: r.current, mode: r.mode })))
    toast(`${data.length} rows exported`, 'success', 2500)
  }

  // ---- Compare mode ----
  const runCompare = async () => {
    if (!periodA.from || !periodA.to || !periodB.from || !periodB.to) {
      toast('Select both periods first', 'warning'); return
    }
    setLoading(true)
    try {
      const [rowsA, rowsB] = await Promise.all([
        fetchReadings({ from: periodA.from, to: periodA.to, limit: 50000 }),
        fetchReadings({ from: periodB.from, to: periodB.to, limit: 50000 }),
      ])
      setCompareRows({ rowsA, rowsB })
      if (!rowsA.length && !rowsB.length) toast('No data in selected periods', 'warning')
    } catch (e) {
      toast(e.response?.data?.detail || 'Compare failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  const exitCompare = () => {
    setCompareRows(null)
    setCompareOpen(false)
    fetchData()
  }

  const compareMerged = useMemo(() => {
    if (!compareRows) return []
    const { rowsA, rowsB } = compareRows
    const startA = rowsA.length ? new Date(rowsA[0].timestamp).getTime() : 0
    const startB = rowsB.length ? new Date(rowsB[0].timestamp).getTime() : 0
    const merged = []
    for (const r of rowsA) {
      merged.push({ rel: (new Date(r.timestamp).getTime() - startA) / 3600000, wattsA: r.power_watts, wattsB: null })
    }
    for (const r of rowsB) {
      merged.push({ rel: (new Date(r.timestamp).getTime() - startB) / 3600000, wattsA: null, wattsB: r.power_watts })
    }
    return merged.sort((a, b) => a.rel - b.rel)
  }, [compareRows])

  const compareStats = useMemo(() => {
    if (!compareRows) return null
    const stat = (rows) => {
      if (!rows.length) return { kwh: 0, avgW: 0, count: 0 }
      const avgW = rows.reduce((s, r) => s + (r.power_watts || 0), 0) / rows.length
      const durH = (new Date(rows[rows.length - 1].timestamp) - new Date(rows[0].timestamp)) / 3600000
      return { kwh: (avgW / 1000) * durH, avgW, count: rows.length }
    }
    const a = stat(compareRows.rowsA)
    const b = stat(compareRows.rowsB)
    const delta = a.kwh > 0 ? ((b.kwh - a.kwh) / a.kwh) * 100 : null
    return { a, b, delta }
  }, [compareRows])

  const inCompare = !!compareRows
  const totalSpanH = range.hours

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Energy Chart</h2>
          <span className="text-xs text-gray-500 font-mono">
            {inCompare
              ? `${compareRows.rowsA.length} + ${compareRows.rowsB.length} readings`
              : `${data.length} readings`}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {!inCompare && (
            <>
              <SegGroup>
                {RANGES.map((r) => (
                  <SegBtn key={r.label} active={!isCustom && range.label === r.label}
                          onClick={() => { setRangeLabel(r.label); setIsCustom(false) }}>{r.label}</SegBtn>
                ))}
                <SegBtn active={isCustom} onClick={() => setIsCustom(true)}>Custom</SegBtn>
              </SegGroup>

              <SegGroup>
                {MODES.map((m) => (
                  <SegBtn key={m} active={modeFilter === m} onClick={() => setModeFilter(m)} muted>{m}</SegBtn>
                ))}
              </SegGroup>

              <SegGroup>
                <SegBtn active={curveType === 'monotone'} onClick={() => setCurveType('monotone')} muted>Smooth</SegBtn>
                <SegBtn active={curveType === 'stepAfter'} onClick={() => setCurveType('stepAfter')} muted>Step</SegBtn>
              </SegGroup>

              <input
                type="number" min="0" placeholder="Threshold W"
                value={threshold} onChange={(e) => setThreshold(e.target.value)}
                className="bg-card-hover border border-line rounded-lg px-2.5 py-1 text-xs text-gray-200 w-28 font-mono focus:outline-none focus:border-primary"
              />
            </>
          )}

          <button onClick={() => setCompareOpen((v) => !v)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors active:scale-95
                              ${compareOpen || inCompare ? 'bg-primary text-white' : 'bg-card-hover text-gray-300 hover:bg-line'}`}>
            ⇆ Compare
          </button>

          {!inCompare && (
            <>
              <button onClick={fetchData}
                      className="px-3 py-1 rounded-md text-xs font-medium bg-card-hover text-gray-300 hover:bg-line transition-colors active:scale-95">
                ↻
              </button>
              <button onClick={exportCsv} disabled={!data.length}
                      className="px-3 py-1 rounded-md text-xs font-medium bg-card-hover text-gray-300 hover:bg-line transition-colors disabled:opacity-40 active:scale-95">
                ⤓ CSV
              </button>
            </>
          )}

          {inCompare && (
            <button onClick={exitCompare}
                    className="px-3 py-1 rounded-md text-xs font-medium bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 transition-colors active:scale-95">
              ✕ Exit compare
            </button>
          )}
        </div>
      </div>

      {compareOpen && !inCompare && (
        <div className="bg-card-hover border border-line rounded-lg p-3 mb-4 flex flex-wrap gap-4 items-end">
          <PeriodPicker label="Period A" color="text-indigo-400" period={periodA} onChange={setPeriodA} />
          <PeriodPicker label="Period B" color="text-amber-400" period={periodB} onChange={setPeriodB} />
          <button onClick={runCompare}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dim active:scale-95 transition-all">
            Apply
          </button>
        </div>
      )}

      {isCustom && !compareOpen && !inCompare && (
        <div className="flex flex-wrap gap-3 mb-4">
          <DateField label="From" value={customFrom} onChange={setCustomFrom} />
          <DateField label="To" value={customTo} onChange={setCustomTo} />
          <button onClick={fetchData}
                  className="self-end px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dim active:scale-95 transition-all">
            Apply
          </button>
        </div>
      )}

      {/* CHART */}
      {loading ? (
        <div className="h-72 skeleton rounded-lg" />
      ) : inCompare ? (
        <CompareChart data={compareMerged} />
      ) : data.length === 0 ? (
        <EmptyState icon="📈" title="No data for this range" hint="Wait for the collector to gather more readings, or pick a wider window." />
      ) : (
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="gradPower" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.55} />
                <stop offset="100%" stopColor={PRIMARY} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis dataKey="timeLabel" tick={{ fill: '#6b7280', fontSize: 11 }} interval="preserveStartEnd" tickLine={false} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} unit=" W" width={55} />
            <Tooltip content={<CustomTooltip pricePerKwh={pricePerKwh} />} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    formatter={(v) => <span style={{ color: '#9ca3af' }}>{v}</span>} />

            {/* Night tariff bands */}
            {nightBands.map((b, i) => (
              <ReferenceArea
                key={`night-${i}`} x1={b.x1} x2={b.x2}
                fill={NIGHT_FILL} fillOpacity={0.08} strokeOpacity={0}
                label={i === 0 ? { value: 'Off-peak', position: 'insideTopLeft', fill: NIGHT_FILL, fontSize: 10, opacity: 0.6 } : undefined}
              />
            ))}

            {modeBands.map((b, i) => (
              <ReferenceArea
                key={`mode-${i}`} x1={b.x1} x2={b.x2}
                fill={b.mode === 'ECO' ? ECO_COLOR : b.mode === 'FULL' ? FULL_COLOR : PRIMARY}
                fillOpacity={0.04} strokeOpacity={0}
              />
            ))}

            {avgWatts != null && (
              <ReferenceLine y={avgWatts} stroke="#9ca3af" strokeDasharray="4 4"
                             label={{ value: `avg ${Math.round(avgWatts)}W`, fill: '#9ca3af', fontSize: 10, position: 'right' }} />
            )}
            {!isNaN(thresholdNum) && thresholdNum > 0 && (
              <ReferenceLine y={thresholdNum} stroke="#ef4444" strokeDasharray="2 4"
                             label={{ value: `${thresholdNum}W`, fill: '#ef4444', fontSize: 10, position: 'right' }} />
            )}

            {showOverlay ? (
              <>
                <Area type={curveType} dataKey="watts" name="Power" stroke={PRIMARY} fill="url(#gradPower)"
                      strokeWidth={2} dot={dotProps} isAnimationActive={false} />
                <Line type={curveType} dataKey="ecoWatts" name="ECO" stroke={ECO_COLOR}
                      dot={dotProps} strokeWidth={1.5} connectNulls={false} isAnimationActive={false} />
                <Line type={curveType} dataKey="fullWatts" name="FULL" stroke={FULL_COLOR}
                      dot={dotProps} strokeWidth={1.5} connectNulls={false} isAnimationActive={false} />
              </>
            ) : (
              <Area type={curveType} dataKey="watts" name={`Power (${modeFilter})`}
                    stroke={modeFilter === 'ECO' ? ECO_COLOR : modeFilter === 'FULL' ? FULL_COLOR : PRIMARY}
                    fill="url(#gradPower)" strokeWidth={2} dot={dotProps} isAnimationActive={false} />
            )}

            {data.length > 30 && (
              <Brush
                dataKey="time" height={32} stroke={PRIMARY} fill="#1e1e2e"
                travellerWidth={8}
                tickFormatter={(v) => brushTickFmt(v, totalSpanH)}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* Compare summary */}
      {inCompare && compareStats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4 text-xs">
          <SummaryBox color="text-indigo-400" border="border-indigo-500/40" label="Period A"
                       primary={`${compareStats.a.kwh.toFixed(3)} kWh`}
                       secondary={`${Math.round(compareStats.a.avgW)} W avg · ${compareStats.a.count} pts`} />
          <SummaryBox color="text-amber-400" border="border-amber-500/40" label="Period B"
                       primary={`${compareStats.b.kwh.toFixed(3)} kWh`}
                       secondary={`${Math.round(compareStats.b.avgW)} W avg · ${compareStats.b.count} pts`} />
          <SummaryBox
            color={compareStats.delta == null ? 'text-gray-400' : compareStats.delta > 0 ? 'text-red-400' : 'text-emerald-400'}
            border="border-line" label="Δ B vs A"
            primary={compareStats.delta == null ? '—' :
              `${compareStats.delta > 0 ? '↑' : '↓'} ${Math.abs(compareStats.delta).toFixed(1)}%`}
            secondary="kWh delta" />
        </div>
      )}
    </div>
  )
}

function CompareChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
        <XAxis dataKey="rel" type="number" domain={['dataMin', 'dataMax']}
               tickFormatter={(v) => `${v.toFixed(1)}h`}
               tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} />
        <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} unit=" W" width={55} />
        <Tooltip
          contentStyle={{ backgroundColor: '#12121a', border: '1px solid #1e1e2e', borderRadius: 8 }}
          labelFormatter={(v) => `+${Number(v).toFixed(2)}h from start`}
          formatter={(v) => v == null ? '—' : `${Math.round(v)} W`}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                formatter={(v) => <span style={{ color: '#9ca3af' }}>{v}</span>} />
        <Line type="monotone" dataKey="wattsA" name="Period A" stroke={PRIMARY}
              strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        <Line type="monotone" dataKey="wattsB" name="Period B" stroke={FULL_COLOR}
              strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function PeriodPicker({ label, color, period, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={`text-xs uppercase tracking-wider font-medium ${color}`}>{label}</span>
      <div className="flex gap-1">
        <input type="datetime-local" value={period.from} onChange={(e) => onChange({ ...period, from: e.target.value })}
               className="bg-card border border-line rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-primary" />
        <span className="text-gray-600 self-center">→</span>
        <input type="datetime-local" value={period.to} onChange={(e) => onChange({ ...period, to: e.target.value })}
               className="bg-card border border-line rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-primary" />
      </div>
    </div>
  )
}

function SummaryBox({ color, border, label, primary, secondary }) {
  return (
    <div className={`bg-card-hover rounded-lg border ${border} px-3 py-2`}>
      <div className="text-[10px] uppercase tracking-widest text-gray-500">{label}</div>
      <div className={`text-lg font-mono font-bold tabular-nums ${color}`}>{primary}</div>
      <div className="text-[10px] text-gray-500 font-mono">{secondary}</div>
    </div>
  )
}

function SegGroup({ children }) {
  return <div className="flex gap-1 bg-card-hover rounded-lg p-1">{children}</div>
}

function SegBtn({ active, onClick, children, muted }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors active:scale-95 ${
        active ? (muted ? 'bg-line text-white' : 'bg-primary text-white') : 'text-gray-400 hover:text-gray-200'
      }`}>
      {children}
    </button>
  )
}

function DateField({ label, value, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500">{label}</label>
      <input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)}
             className="bg-card-hover border border-line rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-primary" />
    </div>
  )
}

function CustomTooltip({ active, payload, label, pricePerKwh }) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  if (!r) return null
  const costPerHour = ((r.watts || 0) / 1000) * pricePerKwh
  return (
    <div className="bg-card border border-line rounded-lg p-3 text-xs shadow-xl">
      <div className="text-gray-400 mb-1">{label}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono tabular-nums">
        <span className="text-gray-500">Power</span><span className="text-gray-100 text-right">{Math.round(r.watts)} W</span>
        <span className="text-gray-500">Voltage</span><span className="text-gray-100 text-right">{r.voltage?.toFixed(1)} V</span>
        <span className="text-gray-500">Current</span><span className="text-gray-100 text-right">{r.current?.toFixed(2)} A</span>
        <span className="text-gray-500">Mode</span><span className="text-gray-100 text-right">{r.mode}</span>
        <span className="text-gray-500">€/h</span><span className="text-gray-100 text-right">€{costPerHour.toFixed(3)}</span>
      </div>
    </div>
  )
}
