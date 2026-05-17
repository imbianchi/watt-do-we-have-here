export const fmtW = (w, d = 0) => (w == null ? '—' : `${Number(w).toFixed(d)} W`)
export const fmtKwh = (k, d = 3) => (k == null ? '—' : `${Number(k).toFixed(d)} kWh`)
export const fmtV = (v) => (v == null ? '—' : `${Number(v).toFixed(1)} V`)
export const fmtA = (a) => (a == null ? '—' : `${Number(a).toFixed(2)} A`)
export const fmtCost = (c, ccy = '€') => (c == null ? '—' : `${ccy}${Number(c).toFixed(2)}`)
export const fmtPct = (p) => (p == null ? '—' : `${(p * 100).toFixed(1)}%`)
export const fmtTemp = (t) => (t == null ? '—' : `${Number(t).toFixed(1)} °C`)

export function fmtUptime(seconds) {
  if (seconds == null) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts = []
  if (d) parts.push(`${d}d`)
  if (h || d) parts.push(`${h}h`)
  parts.push(`${m}m`)
  return parts.join(' ')
}

export function downloadCsv(filename, rows) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const escape = (v) => {
    if (v == null) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function relativeTime(date) {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  const diffMs = Date.now() - d.getTime()
  const sec = Math.round(diffMs / 1000)
  if (sec < 0) return 'now'
  if (sec < 5) return 'just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return d.toLocaleDateString()
}

export function safeFilename(s) {
  return String(s || 'export').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export const ICONS = {
  plug: '🔌',
  thermometer: '🌡️',
  'washing-machine': '🧺',
  lightbulb: '💡',
  fan: '🌀',
  refrigerator: '🧊',
}

export const iconFor = (k) => ICONS[k] || ICONS.plug
