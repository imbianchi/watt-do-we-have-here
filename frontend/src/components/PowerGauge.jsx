import { useTween } from '../lib/hooks'

const MAX = 2000
const SIZE = 220
const STROKE = 18
const RADIUS = (SIZE - STROKE) / 2
const CIRC = Math.PI * RADIUS

function colorFor(pct) {
  if (pct < 0.25) return '#6366f1'
  if (pct < 0.55) return '#10b981'
  if (pct < 0.80) return '#f59e0b'
  return '#ef4444'
}

function polar(cx, cy, r, deg) {
  const rad = ((deg - 180) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

export default function PowerGauge({ watts = 0, min, max, oneHourAgo }) {
  const animated = useTween(Math.min(watts || 0, MAX), 600)
  const pct = Math.min(animated / MAX, 1)
  const color = colorFor(pct)
  const dash = `${pct * CIRC} ${CIRC}`

  const indicatorAt = (w) => {
    const p = Math.min(Math.max(w / MAX, 0), 1)
    return 180 - p * 180
  }

  const cx = SIZE / 2
  const cy = SIZE / 2 + STROKE / 2

  let trend = null
  if (oneHourAgo != null && oneHourAgo > 0 && watts != null) {
    const diff = watts - oneHourAgo
    if (Math.abs(diff) > 5) trend = { dir: diff > 0 ? 'up' : 'down' }
  }

  return (
    <div className="card p-5 flex flex-col items-center gap-2 h-full justify-center min-h-[260px]">
      <span className="text-xs uppercase tracking-widest text-gray-400">Live Power</span>

      <div className="relative" style={{ width: SIZE, height: SIZE / 2 + STROKE }}>
        <svg width={SIZE} height={SIZE / 2 + STROKE} viewBox={`0 0 ${SIZE} ${SIZE / 2 + STROKE}`}>
          <defs>
            <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="40%" stopColor="#10b981" />
              <stop offset="75%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>
          <path
            d={`M ${STROKE / 2} ${cy} A ${RADIUS} ${RADIUS} 0 0 1 ${SIZE - STROKE / 2} ${cy}`}
            stroke="#1e1e2e" strokeWidth={STROKE} fill="none" strokeLinecap="round"
          />
          <path
            d={`M ${STROKE / 2} ${cy} A ${RADIUS} ${RADIUS} 0 0 1 ${SIZE - STROKE / 2} ${cy}`}
            stroke="url(#gaugeGrad)" strokeWidth={STROKE} fill="none" strokeLinecap="round"
            strokeDasharray={dash} style={{ transition: 'stroke 0.3s ease' }}
          />
          {min != null && min > 0 && (
            <Indicator cx={cx} cy={cy} angle={indicatorAt(min)} color="#34d399" radius={RADIUS} stroke={STROKE} />
          )}
          {max != null && max > 0 && (
            <Indicator cx={cx} cy={cy} angle={indicatorAt(max)} color="#f87171" radius={RADIUS} stroke={STROKE} />
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <div className="font-mono text-4xl font-bold tabular-nums" style={{ color }}>
            {Math.round(animated)}
          </div>
          <div className="text-xs text-gray-500">W of {MAX}</div>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs font-mono text-gray-500 mt-1">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400" /> min {min != null ? Math.round(min) : '—'}W
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-400" /> max {max != null ? Math.round(max) : '—'}W
        </span>
        {trend && (
          <span className={`flex items-center gap-0.5 ${trend.dir === 'up' ? 'text-amber-400' : 'text-emerald-400'}`}>
            {trend.dir === 'up' ? '↑' : '↓'} vs 1h ago
          </span>
        )}
      </div>
    </div>
  )
}

function Indicator({ cx, cy, angle, color, radius, stroke }) {
  const inner = radius - stroke / 2 - 2
  const outer = radius + stroke / 2 + 2
  const [x1, y1] = polar(cx, cy, inner, angle)
  const [x2, y2] = polar(cx, cy, outer, angle)
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2" />
}
