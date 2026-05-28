import { getSessionTitle } from '../../lib/sessionTitle.js'
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
  active: 'status-ping status-ping-active h-2 w-2',
  ended:  'status-ping status-ping-ended h-2 w-2',
  error:  'status-ping status-ping-error h-2 w-2',
}

const PROVIDER_BADGE: Record<SessionRecord['provider'], string> = {
  claude: 'badge-provider-claude',
  codex:  'badge-provider-codex',
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
  const projectName = getSessionTitle(session.workspacePath, session.sessionId)
  const showTerminateButton =
    session.status === 'active' && session.canTerminateSession === true && !!onTerminate
  const showUnsupportedTerminate =
    session.status === 'active' && session.canTerminateSession === false

  return (
    <div
      className={[
        'w-full rounded-xl px-2 py-1.5 transition-colors',
        selected ? 'bg-muted/60 ring-1 ring-[color-mix(in_srgb,var(--color-cockpit-accent)_30%,transparent)]' : 'hover:bg-muted/30',
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
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium ${PROVIDER_BADGE[session.provider]}`}
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
            className={`shrink-0 ${STATUS_DOT[session.status]}`}
            title={session.status}
          />
        </button>

        {showTerminateButton && (
          <button
            type="button"
            onClick={onTerminate}
            disabled={isTerminating}
            className="shrink-0 rounded-md border border-cockpit-red/50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-cockpit-red hover:bg-cockpit-red/10 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
        <p className="px-2 pt-1 text-[11px] text-cockpit-red">{terminateError}</p>
      )}
    </div>
  )
}
