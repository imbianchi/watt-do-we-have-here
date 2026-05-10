import { useState } from 'react'
import axios from 'axios'

export default function ControlPanel({ status, onStatusChange }) {
  const [loadingSwitch, setLoadingSwitch] = useState(false)
  const [loadingMode, setLoadingMode] = useState(false)

  const switchState = status?.switch_state ?? false
  const mode = status?.mode ?? 'FULL'

  const formatUptime = (seconds) => {
    if (!seconds && seconds !== 0) return '—'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h}h ${m}m ${s}s`
  }

  const handleToggle = async () => {
    setLoadingSwitch(true)
    try {
      await axios.post('/api/switch', { state: !switchState })
      setTimeout(onStatusChange, 500) // wait a bit for device to respond
    } catch (err) {
      console.error('Switch error:', err)
    } finally {
      setLoadingSwitch(false)
    }
  }

  const handleModeChange = async (newMode) => {
    if (newMode === mode) return
    setLoadingMode(true)
    try {
      await axios.post('/api/mode', { mode: newMode })
      await onStatusChange()
    } catch (err) {
      console.error('Mode error:', err)
    } finally {
      setLoadingMode(false)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-5">
        Control Panel
      </h2>

      <div className="flex flex-wrap items-center gap-6">
        {/* ON/OFF Toggle */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleToggle}
            disabled={loadingSwitch || !status}
            className={`w-24 h-24 rounded-full text-2xl font-bold shadow-lg transition-all duration-300 border-4 focus:outline-none focus:ring-4
              ${switchState
                ? 'bg-yellow-400 text-gray-900 border-yellow-500 shadow-yellow-500/40 focus:ring-yellow-400/30'
                : 'bg-gray-700 text-gray-400 border-gray-600 focus:ring-gray-600/30'
              }
              ${(loadingSwitch || !status) ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 cursor-pointer'}
            `}
            aria-label="Toggle switch"
          >
            {loadingSwitch ? '…' : switchState ? 'ON' : 'OFF'}
          </button>
          <span className="text-xs text-gray-500">
            {switchState ? 'Device is ON' : 'Device is OFF'}
          </span>
        </div>

        {/* Mode Selector */}
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-widest text-gray-500">Mode</span>
          <div className="flex gap-2">
            {['ECO', 'FULL'].map((m) => (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                disabled={loadingMode || !status}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 border
                  ${mode === m
                    ? m === 'ECO'
                      ? 'bg-emerald-500 text-white border-emerald-600 shadow-emerald-500/30 shadow-md'
                      : 'bg-blue-500 text-white border-blue-600 shadow-blue-500/30 shadow-md'
                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
                  }
                  ${(loadingMode || !status) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                {m}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-500">
            {mode === 'ECO' ? '🌿 Eco-saving mode active' : '⚡ Full power mode active'}
          </span>
        </div>

        {/* Status Info */}
        <div className="ml-auto flex flex-col gap-1 text-right">
          <div className="flex items-center gap-2 justify-end">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                switchState ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'
              }`}
            />
            <span className="text-sm text-gray-300">
              {switchState ? 'Running' : 'Standby'}
            </span>
          </div>
          <span className="text-xs text-gray-500">
            Uptime: {formatUptime(status?.uptime)}
          </span>
        </div>
      </div>
    </div>
  )
}
