import { useActiveSessions } from '../../store/selectors.js'
import { useStore } from '../../store/index.js'
import type { SessionStatus } from '../../store/index.js'

interface Props {
  onFocusSession: (sessionId: string) => void
}

const STATUS_STYLES: Record<SessionStatus, { label: string; dotClass: string; toneClass: string; detail: string | null }> = {
  active: {
    label: 'ACTIVE',
    dotClass: 'status-ping status-ping-active h-2 w-2',
    toneClass: 'data-readout',
    detail: null,
  },
  ended: {
    label: 'ENDED',
    dotClass: 'status-ping status-ping-ended h-2 w-2',
    toneClass: 'data-readout-dim',
    detail: 'Session ended',
  },
  error: {
    label: 'ERROR',
    dotClass: 'status-ping status-ping-error h-2 w-2',
    toneClass: '',
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
        <p className="border border-dashed border-border/80 bg-background/30 px-2 py-4 text-center cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }}>
          -- NO ACTIVE AGENTS --
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
            className={`cockpit-frame-full group w-full rounded-none border px-3 py-2.5 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar ${
              isSelected
                ? 'border-cyan-300/70 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.15),inset_0_0_12px_rgba(34,211,238,0.04)]'
                : 'border-border/80 bg-background/30 hover:-translate-y-px hover:border-cyan-300/40 hover:bg-accent/40'
            }`}
          >
            {isSelected && (
              <>
                <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
                <span className="cockpit-corner cockpit-corner-tr" aria-hidden />
                <span className="cockpit-corner cockpit-corner-bl" aria-hidden />
                <span className="cockpit-corner cockpit-corner-br" aria-hidden />
              </>
            )}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-semibold text-foreground [font-family:var(--font-mono-data)] uppercase tracking-wide">{projectName}</span>
                  <span className={`shrink-0 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${session.provider === 'claude' ? 'badge-provider-claude' : 'badge-provider-codex'}`}>
                    {providerLabel}
                  </span>
                </div>
                <div className={`mt-1 flex items-center gap-1.5 ${statusStyle.toneClass}`} style={session.status === 'error' ? { color: 'var(--color-cockpit-red)' } : undefined}>
                  <span
                    data-testid="status-dot"
                    data-status={session.status}
                    className={`shrink-0 ${statusStyle.dotClass}`}
                  />
                  <span className="[font-family:var(--font-mono-data)] text-[10px] tracking-wider">{statusStyle.label}</span>
                </div>
              </div>

              {session.pendingApprovals > 0 && (
                <span
                  data-testid="pending-approvals-pill"
                  className="inline-flex min-w-6 shrink-0 items-center justify-center rounded-none border border-amber-300/50 bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-300/30 [font-family:var(--font-mono-data)]"
                  style={{ textShadow: '0 0 6px rgba(251,191,36,0.6)' }}
                >
                  {session.pendingApprovals}
                </span>
              )}
            </div>

            {showSecondaryMetadata && (
              <p data-testid="secondary-metadata" className="mt-1 truncate text-[10px] data-readout-dim">
                {secondaryPieces.join(' // ')}
              </p>
            )}
          </button>
        )
      })}
    </div>
  )
}
