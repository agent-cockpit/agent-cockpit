import type { SessionRecord } from '../../store/index.js'

interface SessionCardProps {
  session: SessionRecord
  selected: boolean
  onClick: () => void
  onTerminate?: () => void
  isTerminating?: boolean
  terminateError?: string
  activeSubagentCount?: number
}

const STATUS_DOT: Record<SessionRecord['status'], string> = {
  active: 'bg-green-500',
  ended: 'bg-gray-400',
  error: 'bg-red-500',
}

const PROVIDER_BADGE: Record<SessionRecord['provider'], string> = {
  claude: 'bg-blue-100 text-blue-700',
  codex: 'bg-purple-100 text-purple-700',
}

export function SessionCard({
  session,
  selected,
  onClick,
  onTerminate,
  isTerminating = false,
  terminateError,
  activeSubagentCount = 0,
}: SessionCardProps) {
  const projectName = session.workspacePath.split('/').at(-1) ?? session.workspacePath
  const showTerminateButton =
    session.status === 'active' && session.canTerminateSession === true && !!onTerminate
  const showUnsupportedTerminate =
    session.status === 'active' && session.canTerminateSession === false

  return (
    <div
      className={[
        'w-full rounded px-1 py-1',
        selected ? 'bg-accent' : 'hover:bg-accent/70',
      ].join(' ')}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onClick}
          className="min-w-0 flex-1 text-left px-2 py-1 flex items-center gap-2 rounded transition-colors"
        >
          {/* Provider badge */}
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${PROVIDER_BADGE[session.provider]}`}
          >
            {session.provider}
          </span>

          {/* Project name */}
          <span className="flex-1 truncate text-sm font-medium">{projectName}</span>

          {/* Active subagent badge */}
          {activeSubagentCount > 0 && (
            <span
              className="shrink-0 rounded-full bg-violet-500 px-1.5 py-0.5 text-xs text-white animate-pulse"
              title={`${activeSubagentCount} subagent${activeSubagentCount > 1 ? 's' : ''} running`}
            >
              ⎇{activeSubagentCount}
            </span>
          )}

          {/* Pending approvals badge */}
          {session.pendingApprovals > 0 && (
            <span className="shrink-0 rounded-full bg-orange-500 px-1.5 py-0.5 text-xs text-white">
              {session.pendingApprovals}
            </span>
          )}

          {/* Status dot */}
          <span
            className={`shrink-0 h-2 w-2 rounded-full ${STATUS_DOT[session.status]}`}
            title={session.status}
          />
        </button>

        {showTerminateButton && (
          <button
            type="button"
            onClick={onTerminate}
            disabled={isTerminating}
            className="shrink-0 rounded border border-red-500/60 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Terminate ${projectName}`}
          >
            {isTerminating ? 'Terminating...' : 'Terminate'}
          </button>
        )}
      </div>

      {showUnsupportedTerminate && (
        <p className="px-2 pt-1 text-[11px] text-muted-foreground">
          {session.reason ?? 'Session termination is unavailable for this session.'}
        </p>
      )}

      {terminateError && (
        <p className="px-2 pt-1 text-[11px] text-red-600">{terminateError}</p>
      )}
    </div>
  )
}
