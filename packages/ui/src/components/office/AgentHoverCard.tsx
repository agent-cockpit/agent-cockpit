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
      .split('/')
      .filter(Boolean)
      .pop() ?? session.sessionId

  const providerLabel = session.provider === 'claude' ? 'Claude' : 'Codex'

  return (
    <div
      className="cockpit-frame-full agent-hover-card p-3 bg-background/95 border border-[color-mix(in_srgb,var(--color-cockpit-accent)_40%,transparent)] min-w-[180px] shadow-[0_0_16px_color-mix(in_srgb,var(--color-cockpit-accent)_15%,transparent)] backdrop-blur-sm"
      style={getProviderAccentStyle(session.provider)}
    >
      <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
      <span className="cockpit-corner cockpit-corner-tr" aria-hidden />
      <span className="cockpit-corner cockpit-corner-bl" aria-hidden />
      <span className="cockpit-corner cockpit-corner-br" aria-hidden />

      {/* Provider badge */}
      <span
        data-testid="provider-badge"
        className={`${session.provider === 'claude' ? 'badge-provider-claude' : 'badge-provider-codex'} text-[9px] px-1.5 py-0.5 uppercase tracking-wide`}
      >
        {providerLabel}
      </span>

      {/* Task title */}
      <div data-testid="task-title" className="mt-1 [font-family:var(--font-mono-data)] text-xs font-semibold truncate uppercase tracking-wide text-foreground">
        {session.taskTitle?.trim() || basename}
      </div>

      {/* Status */}
      <div data-testid="agent-status" className="[font-family:var(--font-mono-data)] text-[10px] uppercase mt-0.5" style={{ color: 'var(--color-cockpit-green)' }}>
        {session.status}
      </div>

      {/* Branch */}
      {session.branch && (
        <div
          data-testid="agent-branch"
          className="mt-0.5 inline-block border border-[var(--color-cockpit-cyan)]/35 px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-cockpit-cyan)] [font-family:var(--font-mono-data)]"
          title={`Branch: ${session.branch}`}
        >
          {session.branch}
        </div>
      )}
      {session.projectId && (
        <div
          data-testid="agent-project"
          className="mt-0.5 inline-block border border-[var(--color-cockpit-cyan)]/35 px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-cockpit-cyan)] [font-family:var(--font-mono-data)]"
          title={`Project ID: ${session.projectId}`}
        >
          {session.projectId}
        </div>
      )}
      {(session.parentSessionId || (session.childSessionIds?.length ?? 0) > 0) && (
        <div className="mt-1 flex flex-wrap gap-1">
          {session.parentSessionId && (
            <span
              data-testid="agent-parent"
              className="border border-[var(--color-cockpit-amber)]/45 px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-cockpit-amber)] [font-family:var(--font-mono-data)]"
              title={`Parent session: ${session.parentSessionId}`}
            >
              parent {session.parentSessionId.slice(0, 8)}
            </span>
          )}
          {(session.childSessionIds?.length ?? 0) > 0 && (
            <span
              data-testid="agent-children"
              className="border border-[var(--color-cockpit-amber)]/45 px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-cockpit-amber)] [font-family:var(--font-mono-data)]"
              title={`${session.childSessionIds!.length} child session${session.childSessionIds!.length === 1 ? '' : 's'}`}
            >
              {session.childSessionIds!.length} child{session.childSessionIds!.length === 1 ? '' : 'ren'}
            </span>
          )}
        </div>
      )}

      {/* Repo name */}
      <div data-testid="repo-name" className="data-readout-dim text-[10px] truncate mt-0.5">
        {basename}
      </div>

      {/* Pending approvals */}
      <div data-testid="pending-approvals" className="[font-family:var(--font-mono-data)] text-[10px] text-amber-300 mt-0.5">
        {session.pendingApprovals}
      </div>

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
