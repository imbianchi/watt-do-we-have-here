import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import ControlPanel from './ControlPanel'
import PowerGauge from './PowerGauge'
import EnergyChart from './EnergyChart'
import MetricsPanel from './MetricsPanel'

const REFRESH_INTERVAL = 5000 // 5 seconds

export default function Dashboard() {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/status')
      setStatus(data)
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to reach device')
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [fetchStatus])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-yellow-400 flex items-center gap-2">
            ⚡ Watt Do We Have Here
          </h1>
          <p className="text-sm text-gray-400 mt-1">Home Energy Monitor · Shelly 1PM Mini Gen3</p>
        </div>
        <div className="text-right text-xs text-gray-500">
          {lastUpdated && (
            <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
          )}
          {error && (
            <span className="ml-3 text-red-400 font-medium">⚠ {error}</span>
          )}
        </div>
      </header>

      {/* Grid layout */}
      <div className="grid gap-6">
        {/* Row 1: Control Panel */}
        <section>
          <ControlPanel status={status} onStatusChange={fetchStatus} />
        </section>

        {/* Row 2: Live Metrics */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="md:col-span-2 lg:col-span-1">
              <PowerGauge watts={status?.power_watts ?? 0} />
            </div>
            <StatCard
              label="Voltage"
              value={status ? `${status.voltage.toFixed(1)} V` : '—'}
              icon="🔌"
            />
            <StatCard
              label="Current"
              value={status ? `${status.current_amps.toFixed(2)} A` : '—'}
              icon="⚡"
            />
            <StatCard
              label="Total kWh Today"
              value={status ? `${status.total_kwh.toFixed(3)} kWh` : '—'}
              icon="📊"
            />
          </div>
        </section>

        {/* Row 3: Energy Chart */}
        <section>
          <EnergyChart />
        </section>

        {/* Row 4: Insights */}
        <section>
          <MetricsPanel />
        </section>
      </div>

      <footer className="mt-10 text-center text-xs text-gray-600">
        Refreshing every 5 seconds · Data from Shelly 1PM Mini Gen3
      </footer>
    </div>
  )
}

function StatCard({ label, value, icon }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-2">
      <span className="text-2xl">{icon}</span>
      <span className="text-xs uppercase tracking-widest text-gray-500">{label}</span>
      <span className="text-2xl font-semibold text-gray-100">{value}</span>
    </div>
  )
}
