import { useEffect, useState } from 'react'
import { Shelly } from '../lib/api'
import { useToast } from '../lib/toast'
import EmptyState from './EmptyState'
import { CardSkeleton } from './Skeleton'

const TEMPLATES = {
  blank: {
    label: 'Blank script',
    description: 'Empty starter — write your own mJS code from scratch.',
    suggestedName: 'New script',
    defaults: {},
    fields: [],
    code: () => '// Your script — uses Shelly mJS\nprint("Hello from script");\n',
  },
  overpower: {
    label: 'Overpower guard',
    description: 'Auto-off if power exceeds the threshold continuously for the configured duration.',
    suggestedName: 'Overpower guard',
    defaults: { threshold: 1500, duration: 30 },
    fields: [
      { id: 'threshold', label: 'Watts threshold', type: 'number', min: 1 },
      { id: 'duration', label: 'Seconds before cutting', type: 'number', min: 1 },
    ],
    code: (p) => `// Overpower guard — auto-off when watts > ${p.threshold} for ${p.duration}s
let THRESHOLD = ${p.threshold};
let DURATION_S = ${p.duration};
let over_since = null;
Shelly.addStatusHandler(function(ev) {
  if (ev.name !== 'switch:0') return;
  if (ev.delta.apower === undefined) return;
  let w = ev.delta.apower;
  let now = Date.now() / 1000;
  if (w > THRESHOLD) {
    if (over_since === null) over_since = now;
    else if (now - over_since >= DURATION_S) {
      print('Overpower guard: ' + w + 'W — turning off');
      Shelly.call('Switch.Set', { id: 0, on: false });
      over_since = null;
    }
  } else {
    over_since = null;
  }
});
`,
  },
  night: {
    label: 'Night auto-off',
    description: 'When the device turns on during night hours, immediately turn it off again.',
    suggestedName: 'Night auto-off',
    defaults: { start: 23, end: 7 },
    fields: [
      { id: 'start', label: 'Start hour (0-23)', type: 'number', min: 0, max: 23 },
      { id: 'end', label: 'End hour (0-23)', type: 'number', min: 0, max: 23 },
    ],
    code: (p) => `// Night auto-off — between ${p.start}:00 and ${p.end}:00
let START = ${p.start};
let END = ${p.end};
function isNight(h) { return START < END ? (h >= START && h < END) : (h >= START || h < END); }
Shelly.addStatusHandler(function(ev) {
  if (ev.name !== 'switch:0') return;
  if (ev.delta.output !== true) return;
  let h = new Date().getHours();
  if (isNight(h)) {
    print('Night auto-off active');
    Shelly.call('Switch.Set', { id: 0, on: false });
  }
});
`,
  },
  budget: {
    label: 'Daily kWh budget',
    description: 'Track daily consumption and auto-off when the budget is exceeded. Resets at midnight.',
    suggestedName: 'Daily budget',
    defaults: { limit: 5 },
    fields: [
      { id: 'limit', label: 'kWh limit per day', type: 'number', min: 0.1, step: 0.1 },
    ],
    code: (p) => `// Daily budget — cut off if today's kWh exceeds ${p.limit}
let LIMIT = ${p.limit};
let day_str = null;
let day_start = null;
Timer.set(60000, true, function() {
  Shelly.call('Switch.GetStatus', { id: 0 }, function(r, err) {
    if (err) return;
    let today = new Date().toISOString().slice(0, 10);
    let total = r.aenergy.total / 1000;
    if (day_str !== today) { day_str = today; day_start = total; }
    let used = total - day_start;
    if (used > LIMIT) {
      print('Daily budget exceeded: ' + used.toFixed(2) + ' kWh');
      Shelly.call('Switch.Set', { id: 0, on: false });
    }
  });
});
`,
  },
}

export default function ScriptsTab({ deviceId }) {
  const toast = useToast()
  const [items, setItems] = useState(null)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(null) // {id, name, code}
  const [editorLoading, setEditorLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState({})

  const load = async () => {
    setLoading(true)
    try {
      setItems(await Shelly.listScripts(deviceId))
    } catch (e) {
      setItems([])
      toast(e.response?.data?.detail || 'Could not load scripts', 'error')
    } finally { setLoading(false) }
  }

  useEffect(() => {
    setItems(null); setEditing(null); load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId])

  const withBusy = async (id, key, fn) => {
    setBusy((b) => ({ ...b, [`${id}:${key}`]: true }))
    try { await fn() } finally {
      setBusy((b) => { const n = { ...b }; delete n[`${id}:${key}`]; return n })
    }
  }

  const onRun = (s) => withBusy(s.id, 'run', async () => {
    try { await Shelly.runScript(deviceId, s.id); toast(`Started "${s.name}"`, 'success', 2000); await load() }
    catch (e) { toast(e.response?.data?.detail || 'Run failed', 'error') }
  })

  const onStop = (s) => withBusy(s.id, 'stop', async () => {
    try { await Shelly.stopScript(deviceId, s.id); toast(`Stopped "${s.name}"`, 'success', 2000); await load() }
    catch (e) { toast(e.response?.data?.detail || 'Stop failed', 'error') }
  })

  const onDelete = (s) => withBusy(s.id, 'delete', async () => {
    if (!window.confirm(`Delete script "${s.name}"?`)) return
    try { await Shelly.deleteScript(deviceId, s.id); toast(`Deleted "${s.name}"`, 'success', 2000); await load() }
    catch (e) { toast(e.response?.data?.detail || 'Delete failed', 'error') }
  })

  const onEdit = async (s) => {
    setEditorLoading(true)
    try {
      const { code } = await Shelly.getScript(deviceId, s.id)
      setEditing({ id: s.id, name: s.name, code })
    } catch (e) {
      toast(e.response?.data?.detail || 'Could not load code', 'error')
    } finally { setEditorLoading(false) }
  }

  const onSaveCode = async () => {
    if (!editing) return
    setEditorLoading(true)
    try {
      await Shelly.putScript(deviceId, editing.id, editing.code)
      toast(`Saved "${editing.name}"`, 'success', 2000)
      setEditing(null)
      await load()
    } catch (e) {
      toast(e.response?.data?.detail || 'Save failed', 'error')
    } finally { setEditorLoading(false) }
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Scripts</h2>
          <p className="text-xs text-gray-500 mt-1">mJS scripts run on the device, even when this app is offline.</p>
        </div>
        {!showAdd && !editing && (
          <button onClick={() => setShowAdd(true)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dim active:scale-95 transition-all">
            + Add script
          </button>
        )}
      </div>

      {showAdd && (
        <AddScriptForm deviceId={deviceId}
                       onCancel={() => setShowAdd(false)}
                       onCreated={async (s) => { setShowAdd(false); await load(); if (s) onEdit(s) }} />
      )}

      {editing && (
        <Editor editing={editing} setEditing={setEditing}
                onCancel={() => setEditing(null)}
                onSave={onSaveCode}
                loading={editorLoading} />
      )}

      {!editing && (loading ? <CardSkeleton lines={3} /> :
       !items || items.length === 0 ? (
         <EmptyState icon="📜" title="No scripts yet"
                     hint="Add a template above to automate behaviour directly on the device." />
       ) : (
        <div className="flex flex-col gap-2 mt-4">
          {items.map((s) => (
            <ScriptRow key={s.id} script={s}
                       busy={busy}
                       onRun={() => onRun(s)}
                       onStop={() => onStop(s)}
                       onEdit={() => onEdit(s)}
                       onDelete={() => onDelete(s)} />
          ))}
        </div>
       )
      )}
    </div>
  )
}

function ScriptRow({ script, busy, onRun, onStop, onEdit, onDelete }) {
  const running = script.running
  const bRun = busy[`${script.id}:run`], bStop = busy[`${script.id}:stop`], bDel = busy[`${script.id}:delete`]
  return (
    <div className="bg-card-hover border border-line rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${running ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`}
              title={running ? 'Running' : 'Stopped'} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-100 truncate">{script.name}</span>
            <span className="text-[10px] font-mono text-gray-600">#{script.id}</span>
            {script.enable === false && (
              <span className="text-[10px] text-gray-500 px-1.5 py-0.5 rounded bg-gray-700/40">no autostart</span>
            )}
          </div>
          <div className="text-xs text-gray-500">{running ? 'running' : 'stopped'}</div>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {running ? (
          <button onClick={onStop} disabled={bStop}
                  className="px-2.5 py-1 rounded text-xs font-medium bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 transition-colors active:scale-95 disabled:opacity-50">
            {bStop ? '…' : 'Stop'}
          </button>
        ) : (
          <button onClick={onRun} disabled={bRun}
                  className="px-2.5 py-1 rounded text-xs font-medium bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 transition-colors active:scale-95 disabled:opacity-50">
            {bRun ? '…' : 'Run'}
          </button>
        )}
        <button onClick={onEdit}
                className="px-2 py-1 rounded text-xs text-gray-300 hover:bg-line transition-colors">
          Edit
        </button>
        <button onClick={onDelete} disabled={bDel}
                className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50">
          Delete
        </button>
      </div>
    </div>
  )
}

function Editor({ editing, setEditing, onCancel, onSave, loading }) {
  return (
    <div className="bg-card-hover border border-line rounded-xl p-4 mb-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider">Editing</span>
          <h3 className="text-sm font-semibold text-gray-100">{editing.name} <span className="text-gray-600 font-mono text-xs">#{editing.id}</span></h3>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} disabled={loading}
                  className="px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:bg-line transition-colors">
            Cancel
          </button>
          <button onClick={onSave} disabled={loading}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dim disabled:opacity-50 active:scale-95 transition-all flex items-center gap-2">
            {loading && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            Save
          </button>
        </div>
      </div>
      <textarea
        value={editing.code}
        onChange={(e) => setEditing({ ...editing, code: e.target.value })}
        spellCheck={false}
        className="w-full min-h-[320px] bg-app border border-line rounded-lg p-3 font-mono text-xs text-gray-100 focus:outline-none focus:border-primary resize-y"
        style={{ tabSize: 2 }}
      />
      <div className="text-[10px] text-gray-600 font-mono">
        {editing.code.length} chars · {editing.code.split('\n').length} lines
      </div>
    </div>
  )
}

function AddScriptForm({ deviceId, onCancel, onCreated }) {
  const toast = useToast()
  const [templateId, setTemplateId] = useState('blank')
  const tpl = TEMPLATES[templateId]
  const [name, setName] = useState(tpl.suggestedName)
  const [params, setParams] = useState({ ...tpl.defaults })
  const [creating, setCreating] = useState(false)

  const switchTemplate = (id) => {
    setTemplateId(id)
    const t = TEMPLATES[id]
    setName(t.suggestedName)
    setParams({ ...t.defaults })
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { toast('Name required', 'warning'); return }
    setCreating(true)
    try {
      const created = await Shelly.createScript(deviceId, name.trim())
      const sid = created.id
      const code = tpl.code(params)
      if (code) await Shelly.putScript(deviceId, sid, code)
      toast(`Created "${name}"`, 'success', 2000)
      onCreated({ id: sid, name: name.trim() })
    } catch (err) {
      toast(err.response?.data?.detail || 'Create failed', 'error')
    } finally { setCreating(false) }
  }

  return (
    <form onSubmit={submit} className="bg-card-hover border border-line rounded-xl p-4 mb-4 flex flex-col gap-3">
      <Field label="Template">
        <select value={templateId} onChange={(e) => switchTemplate(e.target.value)} className="scr-input">
          {Object.entries(TEMPLATES).map(([id, t]) => (
            <option key={id} value={id}>{t.label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">{tpl.description}</p>
      </Field>

      <Field label="Script name">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
               placeholder="My script" className="scr-input" required />
      </Field>

      {tpl.fields.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {tpl.fields.map((f) => (
            <Field key={f.id} label={f.label}>
              <input type={f.type} min={f.min} max={f.max} step={f.step || 1}
                     value={params[f.id] ?? ''}
                     onChange={(e) => setParams({ ...params, [f.id]: f.type === 'number' ? Number(e.target.value) : e.target.value })}
                     className="scr-input font-mono" />
            </Field>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2 mt-1">
        <button type="button" onClick={onCancel} disabled={creating}
                className="px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:bg-line transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={creating}
                className="px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dim disabled:opacity-50 active:scale-95 transition-all flex items-center gap-2">
          {creating && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
          Create
        </button>
      </div>

      <style>{`
        .scr-input { background:#0a0a0f; border:1px solid #1e1e2e; border-radius:0.5rem;
                     padding:0.5rem 0.75rem; font-size:0.875rem; color:#e5e7eb; width:100%; outline:none; }
        .scr-input:focus { border-color:#6366f1; }
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
