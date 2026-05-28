import React from 'react'
import type { SessionRecord } from '../../store/index.js'
import { getProviderAccentStyle } from '../providerAccent.js'

interface AgentHoverCardProps {
  session: SessionRecord
  lastToolUsed?: string
  elapsedMs: number
}

function formatElapsed(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

export function AgentHoverCard({ session, lastToolUsed, elapsedMs }: AgentHoverCardProps) {
  // task title from workspacePath — will improve when SessionRecord gains a title field
  const basename =
    session.workspacePath
      .split(/[/\\]/)
      .filter(Boolean)
      .pop() ?? session.sessionId

  const providerLabel = session.provider === 'claude' ? 'Claude' : 'Codex'

  return (
    <div
      className="rounded-xl agent-hover-card p-3 bg-background/95 border border-[color-mix(in_srgb,var(--color-cockpit-accent)_35%,transparent)] min-w-[180px] shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur-sm"
      style={getProviderAccentStyle(session.provider)}
    >

      {/* Provider badge */}
      <span
        data-testid="provider-badge"
        className={`${session.provider === 'claude' ? 'badge-provider-claude' : 'badge-provider-codex'} text-[9px] px-1.5 py-0.5 uppercase tracking-wide`}
      >
        {providerLabel}
      </span>

      {/* Task title */}
      <div data-testid="task-title" className="mt-1 [font-family:var(--font-mono-data)] text-xs font-semibold truncate uppercase tracking-wide text-foreground">
        {basename}
      </div>

      {/* Status */}
      <div data-testid="agent-status" className="[font-family:var(--font-mono-data)] text-[10px] uppercase mt-0.5" style={{ color: 'var(--color-cockpit-green)' }}>
        {session.status}
      </div>

      {/* Repo name */}
      <div data-testid="repo-name" className="data-readout-dim text-[10px] truncate mt-0.5">
        {basename}
      </div>

      {/* Pending approvals */}
      {session.pendingApprovals > 0 && (
        <div data-testid="pending-approvals" className="[font-family:var(--font-mono-data)] text-[10px] text-cockpit-amber mt-0.5">
          {session.pendingApprovals} pending
        </div>
      )}

      {/* Last tool used */}
      <div data-testid="last-tool" className="data-readout-dim text-[10px] mt-0.5">
        {lastToolUsed ?? '—'}
      </div>

      {/* Elapsed time */}
      <div data-testid="elapsed-time" className="data-readout text-[10px] tabular-nums mt-0.5">
        {formatElapsed(elapsedMs)}
      </div>
    </div>
  )
}
