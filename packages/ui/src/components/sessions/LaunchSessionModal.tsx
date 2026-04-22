import { useState } from 'react'
import { getProviderAccentStyle } from '../providerAccent.js'
import { DAEMON_URL } from '../../lib/daemonUrl.js'

interface LaunchSessionModalProps {
  open: boolean
  onClose: () => void
}

type SubmitState =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'error'; message: string }

interface BrowseEntry { name: string; fullPath: string }
interface BrowseResult { path: string; parent: string | null; entries: BrowseEntry[] }

export function LaunchSessionModal({ open, onClose }: LaunchSessionModalProps) {
  const [provider, setProvider] = useState<'claude' | 'codex'>('claude')
  const [permissionMode, setPermissionMode] = useState<'default' | 'dangerously_skip'>('default')
  const [workspacePath, setWorkspacePath] = useState('')
  const [state, setState] = useState<SubmitState>({ type: 'idle' })
  const [browseOpen, setBrowseOpen] = useState(false)
  const [browse, setBrowse] = useState<BrowseResult | null>(null)

  async function openBrowse() {
    const startPath = workspacePath.trim() || '~'
    const res = await fetch(`${DAEMON_URL}/api/browse?path=${encodeURIComponent(startPath)}`)
    if (res.ok) {
      const data = await res.json() as BrowseResult
      setBrowse(data)
      setBrowseOpen(true)
    }
  }

  async function browseInto(path: string) {
    const res = await fetch(`${DAEMON_URL}/api/browse?path=${encodeURIComponent(path)}`)
    if (res.ok) {
      setBrowse(await res.json() as BrowseResult)
    }
  }

  function selectPath(path: string) {
    setWorkspacePath(path)
    setBrowseOpen(false)
    setBrowse(null)
  }

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState({ type: 'loading' })
    try {
      const launchPayload =
        provider === 'claude'
          ? { provider, workspacePath, permissionMode }
          : { provider, workspacePath }
      const res = await fetch(`${DAEMON_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(launchPayload),
      })
      const raw = await res.text()
      let data: {
        sessionId: string
        mode: string
        error?: string
      }
      try {
        data = JSON.parse(raw) as typeof data
      } catch {
        setState({
          type: 'error',
          message: `Daemon returned non-JSON response (${res.status}). Check daemon URL/port.`,
        })
        return
      }
      if (!res.ok) {
        setState({ type: 'error', message: data.error ?? 'Request failed' })
        return
      }
      handleClose()
    } catch (err) {
      setState({ type: 'error', message: String(err) })
    }
  }

  function handleClose() {
    setState({ type: 'idle' })
    setWorkspacePath('')
    setProvider('claude')
    setPermissionMode('default')
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Launch Session"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div
        className="cockpit-frame-full w-full max-w-md bg-background border border-border/80 p-6 shadow-[0_0_40px_color-mix(in_srgb,var(--color-cockpit-accent)_16%,transparent),0_20px_60px_rgba(0,0,0,0.6)]"
        style={getProviderAccentStyle(provider)}
      >
        <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
        <span className="cockpit-corner cockpit-corner-tr" aria-hidden />
        <span className="cockpit-corner cockpit-corner-bl" aria-hidden />
        <span className="cockpit-corner cockpit-corner-br" aria-hidden />

        <div className="mb-5 flex items-center justify-between">
          <h2 className="cockpit-label">Launch Session</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="cockpit-label hover:text-foreground transition-colors px-2 py-1"
          >
            [X]
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="launch-provider" className="cockpit-label block mb-1.5">
                Provider
              </label>
              <select
                id="launch-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value as 'claude' | 'codex')}
                className="block w-full rounded-none border border-border/80 bg-[var(--color-panel-surface)] px-3 py-2 [font-family:var(--font-mono-data)] text-xs text-foreground focus:outline-none focus:border-[color-mix(in_srgb,var(--color-cockpit-accent)_60%,transparent)]"
              >
                <option value="claude">claude</option>
                <option value="codex">codex</option>
              </select>
            </div>

            <div>
              <label htmlFor="launch-workspace" className="cockpit-label block mb-1.5">
                Workspace Path
              </label>
              <div className="flex gap-1.5">
                <input
                  id="launch-workspace"
                  type="text"
                  value={workspacePath}
                  onChange={(e) => { setWorkspacePath(e.target.value); setBrowseOpen(false) }}
                  placeholder="/path/to/project"
                  required
                  className="block min-w-0 flex-1 rounded-none border border-border/80 bg-[var(--color-panel-surface)] px-3 py-2 [font-family:var(--font-mono-data)] text-xs text-foreground placeholder:text-[var(--color-cockpit-dim)] focus:outline-none focus:border-[color-mix(in_srgb,var(--color-cockpit-accent)_60%,transparent)]"
                />
                <button
                  type="button"
                  onClick={() => browseOpen ? setBrowseOpen(false) : openBrowse()}
                  className="cockpit-btn shrink-0 px-2"
                  title="Browse folders"
                >
                  …
                </button>
              </div>

              {browseOpen && browse && (
                <div className="mt-1 border border-[color-mix(in_srgb,var(--color-cockpit-accent)_30%,transparent)] bg-[var(--color-panel-surface)] max-h-48 overflow-y-auto">
                  {/* current path breadcrumb */}
                  <div className="flex items-center gap-1 border-b border-border/40 px-2 py-1">
                    {browse.parent !== null && (
                      <button
                        type="button"
                        onClick={() => browseInto(browse.parent!)}
                        className="cockpit-label hover:text-foreground transition-colors pr-1"
                        title="Go up"
                      >
                        ↑
                      </button>
                    )}
                    <span className="[font-family:var(--font-mono-data)] text-[10px] text-[var(--color-cockpit-dim)] truncate">{browse.path}</span>
                  </div>

                  {browse.entries.length === 0 && (
                    <p className="px-3 py-2 [font-family:var(--font-mono-data)] text-[10px] text-[var(--color-cockpit-dim)]">
                      No subdirectories
                    </p>
                  )}

                  {browse.entries.map((entry) => (
                    <div key={entry.fullPath} className="flex items-center group">
                      <button
                        type="button"
                        onClick={() => browseInto(entry.fullPath)}
                        className="flex-1 px-3 py-1.5 text-left [font-family:var(--font-mono-data)] text-xs text-foreground hover:bg-[color-mix(in_srgb,var(--color-cockpit-accent)_10%,transparent)] truncate"
                      >
                        📁 {entry.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => selectPath(entry.fullPath)}
                        className="shrink-0 px-2 py-1.5 cockpit-label text-[9px] opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity"
                        title="Select this folder"
                      >
                        SELECT
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {provider === 'claude' && (
              <div>
                <label htmlFor="launch-permission-mode" className="cockpit-label block mb-1.5">
                  Permission Level
                </label>
                <select
                  id="launch-permission-mode"
                  value={permissionMode}
                  onChange={(e) => setPermissionMode(e.target.value as 'default' | 'dangerously_skip')}
                  className="block w-full rounded-none border border-border/80 bg-[var(--color-panel-surface)] px-3 py-2 [font-family:var(--font-mono-data)] text-xs text-foreground focus:outline-none focus:border-[color-mix(in_srgb,var(--color-cockpit-accent)_60%,transparent)]"
                >
                  <option value="default">default (approval queue)</option>
                  <option value="dangerously_skip">dangerously skip permissions</option>
                </select>
                {permissionMode === 'dangerously_skip' && (
                  <p className="mt-1 [font-family:var(--font-mono-data)] text-[10px]" style={{ color: 'var(--color-cockpit-red)' }}>
                    All tool permissions will be bypassed.
                  </p>
                )}
              </div>
            )}

            {state.type === 'error' && (
              <p className="[font-family:var(--font-mono-data)] text-xs" style={{ color: 'var(--color-cockpit-red)' }}>
                {state.message}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="cockpit-btn"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={state.type === 'loading'}
                className="cockpit-btn disabled:opacity-40"
                style={{ color: 'var(--color-cockpit-green)', borderColor: 'var(--color-cockpit-green)' }}
              >
                {state.type === 'loading' ? 'Launching…' : 'Launch'}
              </button>
            </div>
        </form>
      </div>
    </div>
  )
}
