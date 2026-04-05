import { useState } from 'react'

// Claude launch uses configure-and-copy mode per RESEARCH.md
// (GitHub issue #771 — Node.js spawn blocked for Claude CLI)

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
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, workspacePath }),
      })
      const data = (await res.json()) as {
        sessionId: string
        hookCommand?: string
        mode: string
        error?: string
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Launch Session</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>

        {state.type !== 'claude-success' && state.type !== 'codex-success' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="launch-provider" className="block text-sm font-medium text-gray-700">
                Provider
              </label>
              <select
                id="launch-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value as 'claude' | 'codex')}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="claude">claude</option>
                <option value="codex">codex</option>
              </select>
            </div>

            <div>
              <label htmlFor="launch-workspace" className="block text-sm font-medium text-gray-700">
                Workspace Path
              </label>
              <input
                id="launch-workspace"
                type="text"
                value={workspacePath}
                onChange={(e) => setWorkspacePath(e.target.value)}
                placeholder="/path/to/project"
                required
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            {state.type === 'error' && (
              <p className="text-sm text-red-600">{state.message}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={state.type === 'loading'}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {state.type === 'loading' ? 'Launching...' : 'Launch'}
              </button>
            </div>
          </form>
        )}

        {state.type === 'claude-success' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Run this command in your terminal to start Claude with Cockpit hooks:
            </p>
            <pre className="overflow-x-auto rounded bg-gray-100 p-3 text-xs">
              {state.hookCommand}
            </pre>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(state.type === 'claude-success' ? (state as { type: 'claude-success'; hookCommand: string }).hookCommand : '')}
                className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                Copy to clipboard
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {state.type === 'codex-success' && (
          <div className="space-y-4">
            <p className="text-sm text-green-600">Session started (ID: {state.sessionId})</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
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
