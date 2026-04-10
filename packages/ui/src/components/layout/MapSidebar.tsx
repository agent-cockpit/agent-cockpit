import { useActiveSessions } from '../../store/selectors.js'

interface Props {
  onFocusSession: (sessionId: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-400',
  ended: 'bg-gray-400',
  failed: 'bg-red-400',
}

export function MapSidebar({ onFocusSession }: Props) {
  const sessions = useActiveSessions()

  return (
    <aside className="w-56 shrink-0 flex flex-col border-r border-border bg-sidebar overflow-y-auto">
      <div className="px-3 py-3 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Active Agents
        </span>
      </div>
      <div className="flex flex-col gap-1 p-2">
        {sessions.length === 0 && (
          <p className="text-xs text-muted-foreground px-2 py-4 text-center">
            No active agents
          </p>
        )}
        {sessions.map((session) => {
          const projectName = session.workspacePath.split('/').at(-1) ?? session.sessionId
          const dotColor = STATUS_COLORS[session.status] ?? 'bg-gray-400'
          return (
            <button
              key={session.sessionId}
              onClick={() => onFocusSession(session.sessionId)}
              className="flex items-center gap-2 px-2 py-2 rounded-md text-left
                         hover:bg-accent hover:text-accent-foreground transition-colors w-full"
            >
              <span
                data-testid="status-dot"
                className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`}
              />
              <span className="text-sm truncate">{projectName}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
