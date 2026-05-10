import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

const RANGES = [
  { label: '1h', hours: 1 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 24 * 7 },
  { label: '30d', hours: 24 * 30 },
]

const MODE_FILTERS = ['ALL', 'ECO', 'FULL']

function formatTime(ts) {
  const d = new Date(ts)
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ECO_COLOR = '#34d399'
const FULL_COLOR = '#60a5fa'
const ALL_COLOR = '#facc15'

export default function EnergyChart() {
  const [range, setRange] = useState(RANGES[1]) // default 24h
  const [modeFilter, setModeFilter] = useState('ALL')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [isCustom, setIsCustom] = useState(false)

  const fetchReadings = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}

      if (isCustom) {
        if (customFrom) params.from = customFrom
        if (customTo) params.to = customTo
      } else {
        const from = new Date(Date.now() - range.hours * 3600 * 1000)
        params.from = from.toISOString()
      }

      if (modeFilter !== 'ALL') {
        params.mode = modeFilter
      }

      const { data: rows } = await axios.get('/api/readings', { params })

      // If comparing modes (ALL selected), split into ECO/FULL series for overlay
      const formatted = rows.map((r) => ({
        time: r.timestamp,
        timeFormatted: formatTime(r.timestamp),
        watts: r.power_watts,
        mode: r.mode,
        ecoWatts: r.mode === 'ECO' ? r.power_watts : null,
        fullWatts: r.mode === 'FULL' ? r.power_watts : null,
      }))

      setData(formatted)
    } catch (err) {
      console.error('Chart fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [range, modeFilter, isCustom, customFrom, customTo])

  useEffect(() => {
    fetchReadings()
  }, [fetchReadings])

  const showOverlay = modeFilter === 'ALL'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
          Energy Chart
        </h2>

        <div className="flex flex-wrap gap-2 items-center">
          {/* Range buttons */}
          <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
            {RANGES.map((r) => (
              <button
                key={r.label}
                onClick={() => { setRange(r); setIsCustom(false) }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors
                  ${!isCustom && range.label === r.label
                    ? 'bg-yellow-400 text-gray-900'
                    : 'text-gray-400 hover:text-gray-200'
                  }`}
              >
                {r.label}
              </button>
            ))}
            <button
              onClick={() => setIsCustom(true)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors
                ${isCustom ? 'bg-yellow-400 text-gray-900' : 'text-gray-400 hover:text-gray-200'}`}
            >
              Custom
            </button>
          </div>

          {/* Mode filter */}
          <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
            {MODE_FILTERS.map((m) => (
              <button
                key={m}
                onClick={() => setModeFilter(m)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors
                  ${modeFilter === m ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                {m}
              </button>
            ))}
          </div>

          <button
            onClick={fetchReadings}
            className="px-3 py-1 rounded-md text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Custom date range inputs */}
      {isCustom && (
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">From</label>
            <input
              type="datetime-local"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-yellow-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">To</label>
            <input
              type="datetime-local"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-yellow-400"
            />
          </div>
          <button
            onClick={fetchReadings}
            className="self-end px-4 py-1.5 rounded-lg text-sm font-medium bg-yellow-400 text-gray-900 hover:bg-yellow-300 transition-colors"
          >
            Apply
          </button>
        </div>
      )}

      {/* Chart */}
      {loading ? (
        <div className="h-64 flex items-center justify-center text-gray-500">Loading…</div>
      ) : data.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-gray-600">
          No data available for this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="timeFormatted"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              interval="preserveStartEnd"
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              unit=" W"
              width={55}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              labelStyle={{ color: '#9ca3af', fontSize: 12 }}
              itemStyle={{ fontSize: 12 }}
              formatter={(val) => val !== null ? [`${val.toFixed(1)} W`] : ['—']}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={(value) => <span style={{ color: '#9ca3af' }}>{value}</span>}
            />

            {showOverlay ? (
              <>
                <Line
                  type="monotone"
                  dataKey="ecoWatts"
                  name="ECO"
                  stroke={ECO_COLOR}
                  dot={false}
                  strokeWidth={2}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="fullWatts"
                  name="FULL"
                  stroke={FULL_COLOR}
                  dot={false}
                  strokeWidth={2}
                  connectNulls={false}
                />
              </>
            ) : (
              <Line
                type="monotone"
                dataKey="watts"
                name={`Power (${modeFilter})`}
                stroke={modeFilter === 'ECO' ? ECO_COLOR : modeFilter === 'FULL' ? FULL_COLOR : ALL_COLOR}
                dot={false}
                strokeWidth={2}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
