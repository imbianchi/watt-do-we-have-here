import { useEffect, useState } from 'react'
import { Shelly } from '../lib/api'
import { useToast } from '../lib/toast'
import EmptyState from './EmptyState'
import { CardSkeleton } from './Skeleton'

const DAYS = [
  { id: 'mon', label: 'Mon' },
  { id: 'tue', label: 'Tue' },
  { id: 'wed', label: 'Wed' },
  { id: 'thu', label: 'Thu' },
  { id: 'fri', label: 'Fri' },
  { id: 'sat', label: 'Sat' },
  { id: 'sun', label: 'Sun' },
]
const WEEKDAYS = new Set(['mon', 'tue', 'wed', 'thu', 'fri'])
const WEEKEND = new Set(['sat', 'sun'])
const ALL_DAYS = new Set(DAYS.map((d) => d.id))

function previewLabel({ time, days, action }) {
  if (!time || !days?.length) return ''
  const set = new Set(days.map((d) => d.toLowerCase()))
  let dayPart
  const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x))
  if (sameSet(set, ALL_DAYS)) dayPart = 'Every day'
  else if (sameSet(set, WEEKDAYS)) dayPart = 'Every weekday'
  else if (sameSet(set, WEEKEND)) dayPart = 'Every weekend'
  else dayPart = DAYS.filter((d) => set.has(d.id)).map((d) => d.label).join(', ')
  return `${dayPart} at ${time} → ${(action || '').toUpperCase()}`
}

export default function SchedulesTab({ deviceId }) {
  const toast = useToast()
  const [items, setItems] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null) // schedule object when editing

  const load = async () => {
    setLoading(true)
    try {
      const data = await Shelly.listSchedules(deviceId)
      setItems(data)
    } catch (err) {
      setItems([])
      toast(err.response?.data?.detail || 'Could not load schedules', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { setItems(null); load() }, [deviceId])

  const onDelete = async (jobId) => {
    try {
      await Shelly.deleteSchedule(deviceId, jobId)
      toast('Schedule deleted', 'success', 2000)
      await load()
    } catch (e) {
      toast(e.response?.data?.detail || 'Delete failed', 'error')
    }
  }

  const onToggle = async (job) => {
    try {
      await Shelly.updateSchedule(deviceId, job.id, {
        label: job.label, action: job.action, time: job.time,
        days: job.days, enabled: !job.enabled,
      })
      toast(`Schedule ${!job.enabled ? 'enabled' : 'disabled'}`, 'success', 2000)
      await load()
    } catch (e) {
      toast(e.response?.data?.detail || 'Update failed', 'error')
    }
  }

  const onSaved = async () => {
    setShowForm(false); setEditing(null)
    await load()
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Schedules</h2>
        {!showForm && !editing && (
          <button onClick={() => setShowForm(true)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dim active:scale-95 transition-all">
            + Add schedule
          </button>
        )}
      </div>

      {(showForm || editing) && (
        <ScheduleForm deviceId={deviceId} existing={editing}
                      onCancel={() => { setShowForm(false); setEditing(null) }}
                      onSaved={onSaved} />
      )}

      {loading ? <CardSkeleton lines={3} /> :
       !items || items.length === 0 ? (
         <EmptyState icon="⏰" title="No schedules yet"
                     hint="Schedules are stored on the Shelly device and run even when this app is offline." />
       ) : (
        <div className="flex flex-col gap-2 mt-4">
          {items.map((job) => (
            <ScheduleRow key={job.id} job={job}
                         onDelete={() => onDelete(job.id)}
                         onToggle={() => onToggle(job)}
                         onEdit={() => setEditing(job)} />
          ))}
        </div>
       )}
    </div>
  )
}

function ScheduleRow({ job, onDelete, onToggle, onEdit }) {
  const preview = previewLabel(job)
  const onColor = job.action === 'on' ? 'text-emerald-400' : 'text-gray-400'
  return (
    <div className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border transition-colors
                     ${job.enabled ? 'bg-card-hover border-line' : 'bg-card border-line opacity-60'}`}>
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={onToggle}
                className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0
                            ${job.enabled ? 'bg-primary' : 'bg-line'}`}
                aria-pressed={job.enabled} title={job.enabled ? 'Disable' : 'Enable'}>
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all
                            ${job.enabled ? 'left-4' : 'left-0.5'}`} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-100 truncate">{job.label || `Schedule #${job.id}`}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/40">Device</span>
            {job.stale && (
              <span className="text-[10px] text-amber-400">stale — device offline</span>
            )}
          </div>
          <div className="text-xs text-gray-500 font-mono">
            <span className={onColor}>{job.action?.toUpperCase()}</span>
            {' · '}{preview || job.timespec}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={onEdit}
                className="px-2 py-1 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-line transition-colors">
          Edit
        </button>
        <button onClick={onDelete}
                className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/20 transition-colors">
          Delete
        </button>
      </div>
    </div>
  )
}

function ScheduleForm({ deviceId, existing, onCancel, onSaved }) {
  const toast = useToast()
  const [label, setLabel] = useState(existing?.label || '')
  const [time, setTime] = useState(existing?.time || '22:30')
  const [days, setDays] = useState(new Set(existing?.days || ['mon', 'tue', 'wed', 'thu', 'fri']))
  const [action, setAction] = useState(existing?.action || 'on')
  const [enabled, setEnabled] = useState(existing?.enabled ?? true)
  const [saving, setSaving] = useState(false)

  const toggleDay = (d) => {
    const next = new Set(days)
    if (next.has(d)) next.delete(d); else next.add(d)
    setDays(next)
  }

  const submit = async (e) => {
    e?.preventDefault()
    if (!days.size) { toast('Select at least one day', 'warning'); return }
    setSaving(true)
    try {
      const body = { label: label.trim() || null, time, days: [...days], action, enabled }
      if (existing) {
        await Shelly.updateSchedule(deviceId, existing.id, body)
        toast('Schedule updated', 'success', 2000)
      } else {
        await Shelly.createSchedule(deviceId, body)
        toast('Schedule created', 'success', 2000)
      }
      onSaved()
    } catch (err) {
      toast(err.response?.data?.detail || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-card-hover border border-line rounded-xl p-4 mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap gap-3 items-end">
        <Field label="Label">
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
                 placeholder="Night heating" className="sched-input" />
        </Field>
        <Field label="Time">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                 className="sched-input font-mono w-28" required />
        </Field>
        <Field label="Action">
          <div className="flex gap-1 bg-card rounded-lg p-1">
            {['on', 'off'].map((a) => (
              <button key={a} type="button" onClick={() => setAction(a)}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        action === a ? (a === 'on' ? 'bg-emerald-500 text-white' : 'bg-gray-600 text-white') : 'text-gray-400'
                      }`}>
                {a.toUpperCase()}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div>
        <span className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Days</span>
        <div className="flex gap-1 flex-wrap">
          {DAYS.map((d) => (
            <button key={d.id} type="button" onClick={() => toggleDay(d.id)}
                    className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                      days.has(d.id)
                        ? 'bg-primary border-primary text-white'
                        : 'bg-card border-line text-gray-400 hover:bg-line'
                    }`}>
              {d.label}
            </button>
          ))}
          <button type="button" onClick={() => setDays(new Set([...WEEKDAYS]))}
                  className="px-2 py-1 rounded text-[10px] text-gray-500 hover:text-gray-200">weekday</button>
          <button type="button" onClick={() => setDays(new Set([...WEEKEND]))}
                  className="px-2 py-1 rounded text-[10px] text-gray-500 hover:text-gray-200">weekend</button>
          <button type="button" onClick={() => setDays(new Set([...ALL_DAYS]))}
                  className="px-2 py-1 rounded text-[10px] text-gray-500 hover:text-gray-200">all</button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mt-1">
        <div className="text-xs text-gray-400 italic">
          {previewLabel({ time, days: [...days], action }) || 'Pick days to preview'}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}
                   className="accent-primary" />
            Enabled
          </label>
          <button type="button" onClick={onCancel} disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:bg-line transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dim disabled:opacity-50 active:scale-95 transition-all flex items-center gap-2">
            {saving && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            {existing ? 'Save' : 'Create'}
          </button>
        </div>
      </div>

      <style>{`
        .sched-input { background:#0a0a0f; border:1px solid #1e1e2e; border-radius:0.5rem;
                       padding:0.5rem 0.75rem; font-size:0.875rem; color:#e5e7eb; outline:none; }
        .sched-input:focus { border-color:#6366f1; }
      `}</style>
    </form>
  )
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      {children}
    </label>
  )
}
