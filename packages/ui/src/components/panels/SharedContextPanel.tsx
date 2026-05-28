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
      return <p className="mt-1.5 data-readout-dim text-[10px] italic">empty list</p>
    }
    return (
      <div className="mt-1.5 flex flex-wrap gap-1">
        {list.map((item, i) => (
          <span
            key={i}
            className="[font-family:var(--font-mono-data)] text-[10px] px-1.5 py-0.5 border border-[color-mix(in_srgb,var(--color-cockpit-accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-cockpit-accent)_8%,transparent)] text-[var(--color-cockpit-accent)]"
          >
            {item}
          </span>
        ))}
      </div>
    )
  }
  return (
    <pre className="mt-1.5 [font-family:var(--font-mono-data)] text-xs text-muted-foreground whitespace-pre-wrap break-all">
      {value}
    </pre>
  )
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 shrink-0 bg-[var(--color-panel-surface)]">
        <div>
          <h2 className="cockpit-label">Shared Context</h2>
          <p className="data-readout-dim text-[10px] mt-0.5">Visible to all agent sessions via MCP</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="cockpit-btn text-[10px] px-2.5 py-1"
        >
          + Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {adding && (
          <div className="border border-[color-mix(in_srgb,var(--color-cockpit-accent)_35%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-cockpit-accent)_4%,transparent)] p-3 space-y-2">
            <input
              className="w-full [font-family:var(--font-mono-data)] text-xs border border-border/80 bg-background/50 text-foreground px-2 py-1.5 outline-none focus:border-[color-mix(in_srgb,var(--color-cockpit-accent)_60%,transparent)]"
              placeholder="Key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              autoFocus
            />
            <textarea
              className="w-full [font-family:var(--font-mono-data)] text-xs border border-border/80 bg-background/50 text-foreground px-2 py-1.5 outline-none focus:border-[color-mix(in_srgb,var(--color-cockpit-accent)_60%,transparent)] resize-none"
              placeholder="Value"
              rows={3}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={() => void handleAdd()}
                disabled={saving || !newKey.trim() || !newValue.trim()}
                className="cockpit-btn text-[10px] px-3 py-1 disabled:opacity-40"
                style={{ color: 'var(--color-cockpit-green)', borderColor: 'color-mix(in srgb, var(--color-cockpit-green) 50%, transparent)' }}
              >
                Save
              </button>
              <button
                onClick={() => { setAdding(false); setNewKey(''); setNewValue('') }}
                className="cockpit-btn text-[10px] px-3 py-1"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {entries.length === 0 && !adding && (
          <div className="text-center py-8 data-readout-dim text-xs">
            No shared context entries yet.<br />
            Agents can write here using <code className="[font-family:var(--font-mono-data)] text-[var(--color-cockpit-accent)]">context_set</code>.
          </div>
        )}

        {entries.map(([key, entry]) => (
          <div key={key} className="border border-border/60 bg-[var(--color-panel-surface)] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <span className="[font-family:var(--font-mono-data)] text-xs font-semibold text-[var(--color-cockpit-accent)] break-all">
                  {key}
                </span>
                {entry.updatedBySessionId && (
                  <span className="ml-2 [font-family:var(--font-mono-data)] text-[10px] text-[var(--color-cockpit-dim)]">
                    by {entry.updatedBySessionId.slice(0, 8)}…
                  </span>
                )}
                <span className="ml-2 [font-family:var(--font-mono-data)] text-[10px] text-[var(--color-cockpit-dim)]">
                  {new Date(entry.updatedAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => { setEditingKey(key); setEditValue(entry.value) }}
                  className="[font-family:var(--font-mono-data)] text-[10px] px-1.5 py-0.5 border border-border/60 bg-transparent text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => void handleDelete(key)}
                  className="[font-family:var(--font-mono-data)] text-[10px] px-1.5 py-0.5 border border-cockpit-red/40 bg-transparent text-cockpit-red/60 hover:text-cockpit-red hover:bg-cockpit-red/10 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {editingKey === key ? (
              <div className="mt-2 space-y-1.5">
                <textarea
                  className="w-full [font-family:var(--font-mono-data)] text-xs border border-border/80 bg-background/50 text-foreground px-2 py-1.5 outline-none focus:border-[color-mix(in_srgb,var(--color-cockpit-accent)_60%,transparent)] resize-none"
                  rows={4}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => void handleSave(key, editValue)}
                    disabled={saving}
                    className="cockpit-btn text-[10px] px-3 py-1 disabled:opacity-40"
                    style={{ color: 'var(--color-cockpit-green)', borderColor: 'color-mix(in srgb, var(--color-cockpit-green) 50%, transparent)' }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingKey(null)}
                    className="cockpit-btn text-[10px] px-3 py-1"
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
