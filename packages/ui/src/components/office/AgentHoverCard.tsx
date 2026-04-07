import React from 'react'
import type { SessionRecord } from '../../store/index.js'

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
  const providerClass =
    session.provider === 'claude' ? 'bg-blue-500' : 'bg-green-600'

  return (
    <div className="agent-hover-card p-2 rounded shadow-md bg-white text-sm min-w-[180px]">
      {/* Provider badge */}
      <span
        data-testid="provider-badge"
        className={`${providerClass} text-white text-xs font-semibold px-2 py-0.5 rounded-full`}
      >
        {providerLabel}
      </span>

      {/* Task title */}
      <div data-testid="task-title" className="mt-1 font-medium truncate">
        {basename}
      </div>

      {/* Status */}
      <div data-testid="agent-status" className="text-gray-600">
        {session.status}
      </div>

      {/* Repo name */}
      <div data-testid="repo-name" className="text-gray-500 text-xs truncate">
        {basename}
      </div>

      {/* Pending approvals */}
      <div data-testid="pending-approvals" className="text-orange-600">
        {session.pendingApprovals}
      </div>

      {/* Last tool used */}
      <div data-testid="last-tool" className="text-gray-500 text-xs">
        {lastToolUsed ?? '—'}
      </div>

      {/* Elapsed time */}
      <div data-testid="elapsed-time" className="text-gray-400 text-xs">
        {formatElapsed(elapsedMs)}
      </div>
    </div>
  )
}
