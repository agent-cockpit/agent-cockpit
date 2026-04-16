import { useState } from 'react'
import { useActiveSessions } from '../../store/selectors.js'
import { useStore } from '../../store/index.js'
import type { SessionStatus } from '../../store/index.js'
import { LaunchSessionModal } from '../sessions/LaunchSessionModal.js'
import { characterFaceUrl } from '../office/characterMapping.js'
import type { CharacterType } from '../office/characterMapping.js'

interface Props {
  onFocusSession: (sessionId: string) => void
}

const STATUS_STYLES: Record<SessionStatus, { label: string; dotClass: string; toneClass: string; detail: string | null }> = {
  active: {
    label: 'ACTIVE',
    dotClass: 'status-ping status-ping-active h-1.5 w-1.5',
    toneClass: 'data-readout',
    detail: null,
  },
  ended: {
    label: 'ENDED',
    dotClass: 'status-ping status-ping-ended h-1.5 w-1.5',
    toneClass: 'data-readout-dim',
    detail: 'SESSION ENDED',
  },
  error: {
    label: 'ERROR',
    dotClass: 'status-ping status-ping-error h-1.5 w-1.5',
    toneClass: '',
    detail: 'ATTN: REQUIRED',
  },
}

function FaceAvatar({ character }: { character: CharacterType }) {
  const [imgFailed, setImgFailed] = useState(false)
  if (imgFailed) {
    return (
      <span
        data-testid="face-avatar-fallback"
        aria-label={character}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold uppercase text-cyan-300"
      >
        {character[0].toUpperCase()}
      </span>
    )
  }
  return (
    <img
      data-testid="face-avatar"
      src={characterFaceUrl(character)}
      alt={character}
      width={24}
      height={24}
      onError={() => setImgFailed(true)}
      style={{ imageRendering: 'pixelated' }}
      className="h-6 w-6 shrink-0 rounded-full object-cover"
    />
  )
}

export function MapSidebar({ onFocusSession }: Props) {
  const sessions = useActiveSessions()
  const selectedSessionId = useStore((s) => s.selectedSessionId)
  const selectSession = useStore((s) => s.selectSession)
  const setSessionDetailOpen = useStore((s) => s.setSessionDetailOpen)
  const setHistoryMode = useStore((s) => s.setHistoryMode)
  const rows = [...sessions].sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt))
  const [launchOpen, setLaunchOpen] = useState(false)

  return (
    <div className="flex h-full items-center overflow-hidden px-2 gap-2">
      {/* Launch button */}
      <button
        type="button"
        onClick={() => setLaunchOpen(true)}
        className="cockpit-btn shrink-0"
      >
        + LAUNCH
      </button>

      {/* Divider */}
      <div className="h-6 w-px shrink-0 bg-border/60" />

      {/* Sessions — horizontal scrollable */}
      {rows.length === 0 ? (
        <p className="text-[10px] cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }}>
          -- NO ACTIVE AGENTS --
        </p>
      ) : (
        <div className="flex flex-1 gap-2 overflow-x-auto min-w-0 py-1">
          {rows.map((session) => {
            const projectName = session.workspacePath.split('/').at(-1) ?? session.sessionId
            const providerLabel = session.provider === 'claude' ? 'Claude' : 'Codex'
            const statusStyle = STATUS_STYLES[session.status]
            const isSelected = selectedSessionId === session.sessionId

            return (
              <button
                key={session.sessionId}
                type="button"
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => {
                  selectSession(session.sessionId)
                  setHistoryMode?.(false)
                  onFocusSession(session.sessionId)
                  setSessionDetailOpen(true)
                }}
                className={`cockpit-frame-full relative shrink-0 rounded-none border px-2.5 py-1.5 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar ${
                  isSelected
                    ? 'border-cyan-300/70 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.15),inset_0_0_12px_rgba(34,211,238,0.04)]'
                    : 'border-border/80 bg-background/30 hover:-translate-y-px hover:border-cyan-300/40 hover:bg-accent/40'
                }`}
                style={{ width: '180px' }}
              >
                {isSelected && (
                  <>
                    <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
                    <span className="cockpit-corner cockpit-corner-tr" aria-hidden />
                    <span className="cockpit-corner cockpit-corner-bl" aria-hidden />
                    <span className="cockpit-corner cockpit-corner-br" aria-hidden />
                  </>
                )}
                <div className="flex items-center gap-2">
                  <FaceAvatar character={session.character} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-foreground [font-family:var(--font-mono-data)] uppercase tracking-wide">
                        {projectName}
                      </span>
                      {session.pendingApprovals > 0 && (
                        <span
                          data-testid="pending-approvals-pill"
                          className="inline-flex min-w-4 shrink-0 items-center justify-center rounded-none border px-1 py-0 text-[10px] font-semibold ring-1 [font-family:var(--font-mono-data)]"
                          style={{
                            borderColor: 'var(--color-approval-border)',
                            backgroundColor: 'var(--color-approval-bg)',
                            color: 'var(--color-approval-text)',
                            boxShadow: '0 0 0 1px color-mix(in oklch, var(--color-approval-border) 60%, transparent)',
                            textShadow: '0 0 6px rgba(251,191,36,0.6)',
                          }}
                        >
                          {session.pendingApprovals}
                        </span>
                      )}
                    </div>
                    <div
                      className={`flex items-center gap-1 ${statusStyle.toneClass}`}
                      style={session.status === 'error' ? { color: 'var(--color-cockpit-red)' } : undefined}
                    >
                      <span
                        data-testid="status-dot"
                        data-status={session.status}
                        className={`shrink-0 ${statusStyle.dotClass}`}
                      />
                      <span className="[font-family:var(--font-mono-data)] text-[9px] tracking-wider">{statusStyle.label}</span>
                      <span className={`ml-auto shrink-0 px-1 py-0 text-[8px] font-semibold uppercase tracking-wide ${session.provider === 'claude' ? 'badge-provider-claude' : 'badge-provider-codex'}`}>
                        {providerLabel}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <LaunchSessionModal open={launchOpen} onClose={() => setLaunchOpen(false)} />
    </div>
  )
}
