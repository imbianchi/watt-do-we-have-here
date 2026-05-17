import { useEffect, useState } from 'react'
import { Shelly } from '../lib/api'
import { useToast } from '../lib/toast'
import EmptyState from './EmptyState'
import { CardSkeleton } from './Skeleton'

const EVENTS = [
  { id: 'switch.on', label: 'Switch turned ON', desc: 'Fires when the relay closes' },
  { id: 'switch.off', label: 'Switch turned OFF', desc: 'Fires when the relay opens' },
  { id: 'switch.overpower', label: 'Overpower detected', desc: 'Fires when measured power exceeds the configured limit' },
]

const TEMPLATES = [
  {
    id: 'ntfy',
    label: 'ntfy.sh push notification',
    description: 'Free push notifications to your phone via ntfy.sh — replace YOUR-TOPIC with a unique string.',
    urlTemplate: 'https://ntfy.sh/YOUR-TOPIC',
    name: 'ntfy push',
  },
  {
    id: 'custom',
    label: 'Custom URL',
    description: 'Send a GET request to any URL when the event fires.',
    urlTemplate: '',
    name: '',
  },
]

export default function WebhooksTab({ deviceId }) {
  const toast = useToast()
  const [items, setItems] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await Shelly.listWebhooks(deviceId)
      setItems(data)
    } catch (e) {
      setItems([])
      toast(e.response?.data?.detail || 'Could not load webhooks', 'error')
    } finally { setLoading(false) }
  }

  useEffect(() => { setItems(null); load() }, [deviceId])

  const onDelete = async (hookId) => {
    try {
      await Shelly.deleteWebhook(deviceId, hookId)
      toast('Webhook deleted', 'success', 2000)
      await load()
    } catch (e) {
      toast(e.response?.data?.detail || 'Delete failed', 'error')
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Webhooks</h2>
          <p className="text-xs text-gray-500 mt-1">The device sends a GET request to your URL when the event fires.</p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dim active:scale-95 transition-all">
            + Add webhook
          </button>
        )}
      </div>

      {showForm && (
        <WebhookForm deviceId={deviceId} onCancel={() => setShowForm(false)}
                     onSaved={async () => { setShowForm(false); await load() }} />
      )}

      {loading ? <CardSkeleton lines={3} /> :
       !items || items.length === 0 ? (
        <EmptyState icon="🪝" title="No webhooks yet"
                    hint="Webhooks let the device notify external services when events happen." />
       ) : (
        <div className="flex flex-col gap-2 mt-4">
          {items.map((hook) => (
            <HookRow key={hook.id} hook={hook} onDelete={() => onDelete(hook.id)} />
          ))}
        </div>
       )}
    </div>
  )
}

function HookRow({ hook, onDelete }) {
  const event = EVENTS.find((e) => e.id === hook.event)
  return (
    <div className="bg-card-hover border border-line rounded-lg px-3 py-2.5 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-100">{hook.name || `Webhook #${hook.id}`}</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/40">
            {hook.event}
          </span>
          {hook.enable === false && (
            <span className="text-[10px] text-gray-500 px-1.5 py-0.5 rounded bg-gray-700/40">disabled</span>
          )}
        </div>
        {event && <div className="text-xs text-gray-500 mt-0.5">{event.label}</div>}
        <div className="text-xs text-gray-500 font-mono mt-1 truncate">
          {(hook.urls || []).join(', ')}
        </div>
      </div>
      <button onClick={onDelete}
              className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/20 transition-colors flex-shrink-0">
        Delete
      </button>
    </div>
  )
}

function WebhookForm({ deviceId, onCancel, onSaved }) {
  const toast = useToast()
  const [template, setTemplate] = useState('custom')
  const [event, setEvent] = useState('switch.on')
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const applyTemplate = (id) => {
    setTemplate(id)
    const t = TEMPLATES.find((x) => x.id === id)
    if (t) {
      setUrl(t.urlTemplate)
      if (t.name) setName(t.name)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!url.trim()) { toast('URL is required', 'warning'); return }
    setSaving(true)
    try {
      await Shelly.createWebhook(deviceId, {
        event, urls: [url.trim()],
        name: name.trim() || null,
        enable: true,
      })
      toast('Webhook created', 'success', 2000)
      onSaved()
    } catch (err) {
      toast(err.response?.data?.detail || 'Save failed', 'error')
    } finally { setSaving(false) }
  }

  const activeTemplate = TEMPLATES.find((t) => t.id === template)

  return (
    <form onSubmit={submit} className="bg-card-hover border border-line rounded-xl p-4 mb-4 flex flex-col gap-3">
      <Field label="Template">
        <select value={template} onChange={(e) => applyTemplate(e.target.value)} className="wh-input">
          {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        {activeTemplate?.description && (
          <p className="text-xs text-gray-500 mt-1">{activeTemplate.description}</p>
        )}
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Event">
          <select value={event} onChange={(e) => setEvent(e.target.value)} className="wh-input">
            {EVENTS.map((ev) => <option key={ev.id} value={ev.id}>{ev.label}</option>)}
          </select>
        </Field>
        <Field label="Name (optional)">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                 placeholder="My webhook" className="wh-input" />
        </Field>
      </div>

      <Field label="URL">
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
               placeholder="https://example.com/hook" className="wh-input font-mono" required />
        <p className="text-[10px] text-gray-600 mt-1">
          Tip: Shelly supports placeholders like <code className="text-gray-400">$device_id</code>, <code className="text-gray-400">$apower</code> inside the URL.
        </p>
      </Field>

      <div className="flex justify-end gap-2 mt-1">
        <button type="button" onClick={onCancel} disabled={saving}
                className="px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:bg-line transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving}
                className="px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dim disabled:opacity-50 active:scale-95 transition-all flex items-center gap-2">
          {saving && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
          Create
        </button>
      </div>

      <style>{`
        .wh-input { background:#0a0a0f; border:1px solid #1e1e2e; border-radius:0.5rem;
                    padding:0.5rem 0.75rem; font-size:0.875rem; color:#e5e7eb; width:100%; outline:none; }
        .wh-input:focus { border-color:#6366f1; }
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
