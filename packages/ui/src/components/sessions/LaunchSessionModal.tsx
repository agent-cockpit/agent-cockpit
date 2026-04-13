import { useState } from 'react'

// Claude launch uses configure-and-copy mode per RESEARCH.md
// (GitHub issue #771 — Node.js spawn blocked for Claude CLI)
const DAEMON_URL = import.meta.env['VITE_DAEMON_URL'] ?? 'http://localhost:3001'

interface LaunchSessionModalProps {
  open: boolean
  onClose: () => void
}

type SubmitState =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'claude-success'; hookCommand: string; sessionId: string }
  | { type: 'codex-success'; sessionId: string }
  | { type: 'error'; message: string }

export function LaunchSessionModal({ open, onClose }: LaunchSessionModalProps) {
  const [provider, setProvider] = useState<'claude' | 'codex'>('claude')
  const [workspacePath, setWorkspacePath] = useState('')
  const [state, setState] = useState<SubmitState>({ type: 'idle' })

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState({ type: 'loading' })
    try {
      const res = await fetch(`${DAEMON_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, workspacePath }),
      })
      const raw = await res.text()
      let data: {
        sessionId: string
        hookCommand?: string
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
      if (provider === 'claude' && data.hookCommand) {
        setState({ type: 'claude-success', hookCommand: data.hookCommand, sessionId: data.sessionId })
      } else {
        setState({ type: 'codex-success', sessionId: data.sessionId })
      }
    } catch (err) {
      setState({ type: 'error', message: String(err) })
    }
  }

  function handleClose() {
    setState({ type: 'idle' })
    setWorkspacePath('')
    setProvider('claude')
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Launch Session"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="cockpit-frame-full w-full max-w-md bg-background border border-border/80 p-6 shadow-[0_0_40px_rgba(34,211,238,0.08),0_20px_60px_rgba(0,0,0,0.6)]">
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

        {state.type !== 'claude-success' && state.type !== 'codex-success' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="launch-provider" className="cockpit-label block mb-1.5">
                Provider
              </label>
              <select
                id="launch-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value as 'claude' | 'codex')}
                className="block w-full rounded-none border border-border/80 bg-[var(--color-panel-surface)] px-3 py-2 [font-family:var(--font-mono-data)] text-xs text-foreground focus:outline-none focus:border-[var(--color-cockpit-cyan)]/60"
              >
                <option value="claude">claude</option>
                <option value="codex">codex</option>
              </select>
            </div>

            <div>
              <label htmlFor="launch-workspace" className="cockpit-label block mb-1.5">
                Workspace Path
              </label>
              <input
                id="launch-workspace"
                type="text"
                value={workspacePath}
                onChange={(e) => setWorkspacePath(e.target.value)}
                placeholder="/path/to/project"
                required
                className="block w-full rounded-none border border-border/80 bg-[var(--color-panel-surface)] px-3 py-2 [font-family:var(--font-mono-data)] text-xs text-foreground placeholder:text-[var(--color-cockpit-dim)] focus:outline-none focus:border-[var(--color-cockpit-cyan)]/60"
              />
            </div>

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
        )}

        {state.type === 'claude-success' && (
          <div className="space-y-4">
            <p className="[font-family:var(--font-mono-data)] text-xs text-muted-foreground">
              Run this command in your terminal to start Claude with Cockpit hooks:
            </p>
            <pre className="overflow-x-auto bg-[var(--color-panel-surface)] border border-border/60 p-3 [font-family:var(--font-mono-data)] text-xs text-[var(--color-cockpit-cyan)]">
              {state.hookCommand}
            </pre>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(state.type === 'claude-success' ? (state as { type: 'claude-success'; hookCommand: string }).hookCommand : '')}
                className="cockpit-btn"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="cockpit-btn"
                style={{ color: 'var(--color-cockpit-green)', borderColor: 'var(--color-cockpit-green)' }}
              >
                Done
              </button>
            </div>
          </div>
        )}

        {state.type === 'codex-success' && (
          <div className="space-y-4">
            <p className="[font-family:var(--font-mono-data)] text-xs" style={{ color: 'var(--color-cockpit-green)' }}>
              Session started (ID: {state.sessionId})
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="cockpit-btn"
                style={{ color: 'var(--color-cockpit-green)', borderColor: 'var(--color-cockpit-green)' }}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
