import { useState } from 'react'
import { useStore } from '../../store/index.js'
import { DAEMON_URL } from '../../lib/daemonUrl.js'

function tryParseList(value: string): string[] | null {
  if (!value.trim().startsWith('[')) return null
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed
  } catch { /* not JSON */ }
  return null
}

function ContextValue({ value }: { value: string }) {
  const list = tryParseList(value)
  if (list !== null) {
    if (list.length === 0) {
      return <p className="mt-1.5 text-[10px] text-white/30 font-mono italic">empty list</p>
    }
    return (
      <div className="mt-1.5 flex flex-wrap gap-1">
        {list.map((item, i) => (
          <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-white/10 text-white/70 border border-white/10">
            {item}
          </span>
        ))}
      </div>
    )
  }
  return <pre className="mt-1.5 text-xs text-white/70 font-mono whitespace-pre-wrap break-all">{value}</pre>
}

export function SharedContextPanel() {
  const sharedContext = useStore((s) => s.sharedContext)
  const setSharedContext = useStore((s) => s.setSharedContext)
  const entries = Object.entries(sharedContext)

  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)

  async function refreshContext() {
    try {
      const res = await fetch(`${DAEMON_URL}/api/context`)
      const data = await res.json() as Array<{ key: string; value: string; sessionId: string | null; updatedAt: string }>
      setSharedContext(data.map((e) => ({ key: e.key, value: e.value, updatedBySessionId: e.sessionId ?? undefined, updatedAt: e.updatedAt })))
    } catch { /* non-fatal */ }
  }

  async function handleSave(key: string, value: string) {
    setSaving(true)
    try {
      await fetch(`${DAEMON_URL}/api/context/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      })
      await refreshContext()
    } finally {
      setSaving(false)
      setEditingKey(null)
    }
  }

  async function handleDelete(key: string) {
    await fetch(`${DAEMON_URL}/api/context/${encodeURIComponent(key)}`, { method: 'DELETE' })
    await refreshContext()
  }

  async function handleAdd() {
    if (!newKey.trim() || !newValue.trim()) return
    setSaving(true)
    try {
      await fetch(`${DAEMON_URL}/api/context/${encodeURIComponent(newKey.trim())}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newValue.trim() }),
      })
      setNewKey('')
      setNewValue('')
      setAdding(false)
      await refreshContext()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div>
          <h2 className="text-sm font-semibold text-white">Shared Context</h2>
          <p className="text-xs text-white/40 mt-0.5">Visible to all agent sessions via MCP</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="text-xs px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
        >
          + Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {adding && (
          <div className="rounded-lg border border-white/20 bg-white/5 p-3 space-y-2">
            <input
              className="w-full text-xs bg-white/10 rounded px-2 py-1.5 text-white placeholder-white/30 outline-none focus:ring-1 focus:ring-white/30"
              placeholder="Key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              autoFocus
            />
            <textarea
              className="w-full text-xs bg-white/10 rounded px-2 py-1.5 text-white placeholder-white/30 outline-none focus:ring-1 focus:ring-white/30 resize-none"
              placeholder="Value"
              rows={3}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={() => void handleAdd()}
                disabled={saving || !newKey.trim() || !newValue.trim()}
                className="text-xs px-3 py-1 rounded bg-blue-500/80 hover:bg-blue-500 text-white disabled:opacity-40 transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => { setAdding(false); setNewKey(''); setNewValue('') }}
                className="text-xs px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-white/60 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {entries.length === 0 && !adding && (
          <div className="text-center py-8 text-white/30 text-xs">
            No shared context entries yet.<br />
            Agents can write here using <code className="font-mono">context_set</code>.
          </div>
        )}

        {entries.map(([key, entry]) => (
          <div key={key} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <span className="text-xs font-mono font-semibold text-blue-300 break-all">{key}</span>
                {entry.updatedBySessionId && (
                  <span className="ml-2 text-[10px] text-white/30 font-mono">
                    by {entry.updatedBySessionId.slice(0, 8)}…
                  </span>
                )}
                <span className="ml-2 text-[10px] text-white/25">
                  {new Date(entry.updatedAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => { setEditingKey(key); setEditValue(entry.value) }}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/50 hover:text-white transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => void handleDelete(key)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 hover:bg-cockpit-red/40 text-white/50 hover:text-cockpit-red transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {editingKey === key ? (
              <div className="mt-2 space-y-1.5">
                <textarea
                  className="w-full text-xs bg-white/10 rounded px-2 py-1.5 text-white outline-none focus:ring-1 focus:ring-white/30 resize-none font-mono"
                  rows={4}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => void handleSave(key, editValue)}
                    disabled={saving}
                    className="text-xs px-3 py-1 rounded bg-blue-500/80 hover:bg-blue-500 text-white disabled:opacity-40 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingKey(null)}
                    className="text-xs px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-white/60 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <ContextValue value={entry.value} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
