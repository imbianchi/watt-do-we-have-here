import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts'

const MAX_WATTS = 2000

function getColor(watts) {
  const pct = watts / MAX_WATTS
  if (pct < 0.4) return '#34d399' // emerald
  if (pct < 0.7) return '#facc15' // yellow
  return '#f87171' // red
}

export default function PowerGauge({ watts }) {
  const pct = Math.min(watts / MAX_WATTS, 1)
  const color = getColor(watts)

  const data = [{ value: pct * 100 }]

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col items-center gap-2 h-full min-h-[200px] justify-center">
      <span className="text-xs uppercase tracking-widest text-gray-500">Live Power</span>
      <div className="relative w-full" style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="70%"
            innerRadius="70%"
            outerRadius="100%"
            startAngle={180}
            endAngle={0}
            data={data}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              angleAxisId={0}
              tick={false}
            />
            <RadialBar
              background={{ fill: '#1f2937' }}
              dataKey="value"
              angleAxisId={0}
              fill={color}
              cornerRadius={8}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        {/* Centre text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ top: '30%' }}>
          <span className="text-3xl font-bold" style={{ color }}>{Math.round(watts)}</span>
          <span className="text-xs text-gray-500">W</span>
        </div>
      </div>
      <span className="text-xs text-gray-600">of {MAX_WATTS} W max</span>
    </div>
  )
}
