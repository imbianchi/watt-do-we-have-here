import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function heatColor(value, max) {
  if (!max || value === 0) return '#1f2937'
  const intensity = value / max
  // dark blue → yellow → red
  const r = Math.round(intensity * 250)
  const g = Math.round((1 - Math.abs(intensity - 0.5) * 2) * 200)
  const b = Math.round((1 - intensity) * 100)
  return `rgb(${r},${g},${b})`
}

function HeatmapCell({ hour, weekday, avgPower, maxPower }) {
  const color = heatColor(avgPower ?? 0, maxPower)
  return (
    <div
      title={`${DAYS[weekday]} ${String(hour).padStart(2, '0')}:00 — ${avgPower?.toFixed(0) ?? 0} W`}
      style={{ backgroundColor: color }}
      className="rounded aspect-square cursor-default transition-transform hover:scale-110"
    />
  )
}

export default function MetricsPanel() {
  const [insights, setInsights] = useState(null)
  const [pricePerKwh, setPricePerKwh] = useState(0.22)
  const [inputPrice, setInputPrice] = useState('0.22')
  const [loading, setLoading] = useState(false)

  const fetchInsights = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await axios.get('/api/insights', {
        params: { price_per_kwh: pricePerKwh },
      })
      setInsights(data)
    } catch (err) {
      console.error('Insights error:', err)
    } finally {
      setLoading(false)
    }
  }, [pricePerKwh])

  useEffect(() => {
    fetchInsights()
  }, [fetchInsights])

  const handlePriceChange = () => {
    const parsed = parseFloat(inputPrice)
    if (!isNaN(parsed) && parsed > 0) {
      setPricePerKwh(parsed)
    }
  }

  // Build heatmap grid from peak_hours data
  const heatmapData = (() => {
    if (!insights?.peak_hours) return {}
    const map = {}
    for (const { hour, weekday, avg_power } of insights.peak_hours) {
      map[`${weekday}-${hour}`] = avg_power
    }
    return map
  })()

  const maxPower = insights?.peak_hours
    ? Math.max(...insights.peak_hours.map((p) => p.avg_power), 1)
    : 1

  const fmt = (v, decimals = 2) =>
    v !== null && v !== undefined ? v.toFixed(decimals) : '—'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-6">
        Insights & Analytics
      </h2>

      {loading && <p className="text-gray-500 text-sm mb-4">Loading insights…</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          {/* Mode comparison table */}
          <div>
            <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-3">
              Average Consumption by Mode
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left pb-2 font-medium text-gray-400">Mode</th>
                  <th className="text-right pb-2 font-medium text-gray-400">Avg Power</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-800/50">
                  <td className="py-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                    <span className="text-emerald-400 font-medium">ECO</span>
                  </td>
                  <td className="text-right py-2 text-gray-200">
                    {insights?.avg_power_eco != null
                      ? `${fmt(insights.avg_power_eco, 1)} W`
                      : <span className="text-gray-600">No data</span>
                    }
                  </td>
                </tr>
                <tr>
                  <td className="py-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                    <span className="text-blue-400 font-medium">FULL</span>
                  </td>
                  <td className="text-right py-2 text-gray-200">
                    {insights?.avg_power_full != null
                      ? `${fmt(insights.avg_power_full, 1)} W`
                      : <span className="text-gray-600">No data</span>
                    }
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* kWh stats */}
          <div>
            <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-3">
              Energy Consumption
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <KpiCard label="Today" value={`${fmt(insights?.total_kwh_today, 3)} kWh`} />
              <KpiCard label="This Month" value={`${fmt(insights?.total_kwh_month, 3)} kWh`} />
              <KpiCard label="All-Time" value={`${fmt(insights?.total_kwh, 3)} kWh`} />
              <KpiCard
                label="CO₂ (month)"
                value={`${fmt(insights?.co2_kg, 2)} kg`}
                sub="@ 0.25 kg/kWh"
              />
            </div>
          </div>

          {/* Cost estimator */}
          <div>
            <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-3">
              Estimated Monthly Cost
            </h3>
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Price per kWh (€)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={inputPrice}
                    onChange={(e) => setInputPrice(e.target.value)}
                    className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-yellow-400"
                  />
                  <button
                    onClick={handlePriceChange}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-yellow-400 text-gray-900 hover:bg-yellow-300 transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-3xl font-bold text-yellow-400">
                  €{fmt(insights?.estimated_monthly_cost, 2)}
                </span>
                <span className="text-xs text-gray-500">estimated this month</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column — heatmap */}
        <div>
          <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-3">
            Peak Consumption Heatmap
          </h3>
          <p className="text-xs text-gray-600 mb-3">Hour of day × Day of week (avg watts)</p>

          {/* Hour labels */}
          <div className="overflow-x-auto">
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: 'auto repeat(24, minmax(0, 1fr))' }}
            >
              {/* Header row: hours */}
              <div className="text-xs text-gray-700 text-center" />
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="text-center text-gray-600"
                  style={{ fontSize: 9 }}
                >
                  {h}
                </div>
              ))}

              {/* Data rows: days */}
              {DAYS.map((day, wd) => (
                <>
                  <div
                    key={`day-${wd}`}
                    className="text-right pr-1 text-gray-500 flex items-center justify-end"
                    style={{ fontSize: 10 }}
                  >
                    {day}
                  </div>
                  {HOURS.map((h) => (
                    <HeatmapCell
                      key={`${wd}-${h}`}
                      hour={h}
                      weekday={wd}
                      avgPower={heatmapData[`${wd}-${h}`] ?? 0}
                      maxPower={maxPower}
                    />
                  ))}
                </>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-gray-600">Low</span>
            <div
              className="flex-1 h-2 rounded"
              style={{
                background:
                  'linear-gradient(to right, #1f2937, rgb(125,100,0), rgb(250,200,0), rgb(250,50,0))',
              }}
            />
            <span className="text-xs text-gray-600">High</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub }) {
  return (
    <div className="bg-gray-800 rounded-xl p-3 flex flex-col gap-0.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-lg font-semibold text-gray-100">{value}</span>
      {sub && <span className="text-xs text-gray-600">{sub}</span>}
    </div>
  )
}
