import { iconFor } from '../lib/format'

export default function DeviceSelector({ devices, selectedId, onSelect, onAdd }) {
  return (
    <div className="scroll-x overflow-x-auto overflow-y-visible -mx-2 -my-1">
      <div className="flex gap-3 px-2 py-3 min-w-min">
        <AggregateCard
          selected={selectedId === 'all'}
          onClick={() => onSelect('all')}
          devices={devices}
        />
        {devices.map((d) => (
          <DeviceCard
            key={d.id}
            device={d}
            selected={selectedId === d.id}
            onClick={() => onSelect(d.id)}
          />
        ))}
        <button
          onClick={onAdd}
          className="shrink-0 w-48 h-32 rounded-2xl border-2 border-dashed border-line text-gray-500 hover:border-primary hover:text-primary transition-all duration-200 flex flex-col items-center justify-center gap-2"
        >
          <span className="text-3xl leading-none">+</span>
          <span className="text-xs uppercase tracking-widest">Add Device</span>
        </button>
      </div>
    </div>
  )
}

function AggregateCard({ selected, onClick, devices }) {
  const totalW = devices.reduce((s, d) => s + (d.status?.power_watts || 0), 0)
  const onCount = devices.filter((d) => d.status?.switch_state).length
  return (
    <button
      onClick={onClick}
      className={`shrink-0 w-48 h-32 card p-3 text-left transition-all duration-200 ${
        selected ? 'ring-2 ring-primary shadow-[0_0_20px_rgba(99,102,241,0.4)]' : 'hover:bg-card-hover'
      }`}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-gray-400">
        <span>📊</span> All Devices
      </div>
      <div className="text-xl font-mono mt-2 text-gray-100">{Math.round(totalW)} W</div>
      <div className="text-xs text-gray-500 mt-1">
        {onCount}/{devices.length} on · combined
      </div>
    </button>
  )
}

function DeviceCard({ device, selected, onClick }) {
  const s = device.status || {}
  const on = s.switch_state
  const watts = Math.round(s.power_watts || 0)
  const hasAlert = !!device.active_alert
  return (
    <button
      onClick={onClick}
      className={`relative shrink-0 w-48 h-32 card p-3 text-left transition-all duration-200 ${
        selected ? 'ring-2 ring-primary shadow-[0_0_20px_rgba(99,102,241,0.4)]' : 'hover:bg-card-hover'
      }`}
    >
      {hasAlert && (
        <span className="absolute top-2 right-2 text-amber-400 text-xs" title="Active alert">⚠</span>
      )}
      <div className="flex items-center gap-2">
        <span className="text-xl">{iconFor(device.icon)}</span>
        <div className="min-w-0">
          <div className="text-sm text-gray-100 truncate">{device.name}</div>
          {device.location && (
            <div className="text-[10px] text-gray-500 truncate">{device.location}</div>
          )}
          {device.shelly_model && (
            <div className="text-[9px] text-gray-600 font-mono truncate" title={device.shelly_model}>
              {device.shelly_model}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
            on
              ? 'bg-emerald-500/20 text-emerald-400 animate-pulse-glow'
              : s.last_updated
                ? 'bg-gray-700/50 text-gray-400 animate-pulse'
                : 'bg-gray-700/50 text-gray-500'
          }`}
        >
          {on ? 'ON' : 'OFF'}
        </span>
        <span className="text-xs text-gray-400 font-mono">{watts} W</span>
      </div>
      <div className="text-[10px] mt-1 text-gray-500">
        {s.mode === 'ECO' ? '🌿 ECO' : s.mode === 'FULL' ? '⚡ FULL' : '—'}
      </div>
    </button>
  )
}
