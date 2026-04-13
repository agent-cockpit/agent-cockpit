import { useActiveSessions } from '../../store/selectors.js'
import { useStore } from '../../store/index.js'
import type { SessionStatus } from '../../store/index.js'

interface Props {
  onFocusSession: (sessionId: string) => void
}

const STATUS_STYLES: Record<SessionStatus, { label: string; dotClass: string; toneClass: string; detail: string | null }> = {
  active: {
    label: 'Active',
    dotClass: 'bg-emerald-400',
    toneClass: 'text-emerald-300',
    detail: null,
  },
  ended: {
    label: 'Ended',
    dotClass: 'bg-slate-400',
    toneClass: 'text-slate-300',
    detail: 'Session ended',
  },
  error: {
    label: 'Error',
    dotClass: 'bg-rose-400',
    toneClass: 'text-rose-300',
    detail: 'Attention required',
  },
}

export function MapSidebar({ onFocusSession }: Props) {
  const sessions = useActiveSessions()
  const selectedSessionId = useStore((s) => s.selectedSessionId)
  const selectSession = useStore((s) => s.selectSession)
  const rows = [...sessions].sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt))

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2">
      {rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-border/80 bg-background/30 px-2 py-4 text-center text-xs text-muted-foreground">
          No active agents
        </p>
      )}
      {rows.map((session) => {
        const projectName = session.workspacePath.split('/').at(-1) ?? session.sessionId
        const providerLabel = session.provider === 'claude' ? 'Claude' : 'Codex'
        const statusStyle = STATUS_STYLES[session.status]
        const isSelected = selectedSessionId === session.sessionId
        const showSecondaryMetadata = session.pendingApprovals > 0 || session.status !== 'active'
        const secondaryPieces: string[] = []

        if (statusStyle.detail) {
          secondaryPieces.push(statusStyle.detail)
        }
        if (session.pendingApprovals > 0) {
          secondaryPieces.push(`${session.pendingApprovals} pending approval${session.pendingApprovals === 1 ? '' : 's'}`)
        }

        return (
          <button
            key={session.sessionId}
            type="button"
            aria-current={isSelected ? 'true' : undefined}
            onClick={() => {
              selectSession(session.sessionId)
              onFocusSession(session.sessionId)
            }}
            className={`group w-full rounded-lg border px-3 py-2.5 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar ${
              isSelected
                ? 'border-cyan-300/70 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.15)]'
                : 'border-border/80 bg-background/30 hover:-translate-y-px hover:border-cyan-300/40 hover:bg-accent/40'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">{projectName}</span>
                  <span className="shrink-0 rounded-full border border-border/80 bg-muted/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {providerLabel}
                  </span>
                </div>
                <div className={`mt-1 flex items-center gap-1.5 text-xs ${statusStyle.toneClass}`}>
                  <span
                    data-testid="status-dot"
                    data-status={session.status}
                    className={`h-2 w-2 shrink-0 rounded-full ${statusStyle.dotClass}`}
                  />
                  <span>{statusStyle.label}</span>
                </div>
              </div>

              {session.pendingApprovals > 0 && (
                <span
                  data-testid="pending-approvals-pill"
                  className="inline-flex min-w-6 shrink-0 items-center justify-center rounded-full border border-amber-300/50 bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-300/30"
                >
                  {session.pendingApprovals}
                </span>
              )}
            </div>

            {showSecondaryMetadata && (
              <p data-testid="secondary-metadata" className="mt-1 truncate text-[11px] text-muted-foreground">
                {secondaryPieces.join(' • ')}
              </p>
            )}
          </button>
        )
      })}
    </div>
  )
}
