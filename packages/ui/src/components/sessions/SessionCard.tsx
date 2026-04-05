import type { SessionRecord } from '../../store/index.js'

interface SessionCardProps {
  session: SessionRecord
  selected: boolean
  onClick: () => void
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

export function SessionCard({ session, selected, onClick }: SessionCardProps) {
  const projectName = session.workspacePath.split('/').at(-1) ?? session.workspacePath

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full text-left px-3 py-2 flex items-center gap-2 rounded hover:bg-accent transition-colors',
        selected ? 'bg-accent' : '',
      ].join(' ')}
    >
      {/* Provider badge */}
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${PROVIDER_BADGE[session.provider]}`}
      >
        {session.provider}
      </span>

      {/* Project name */}
      <span className="flex-1 truncate text-sm font-medium">{projectName}</span>

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
  )
}
