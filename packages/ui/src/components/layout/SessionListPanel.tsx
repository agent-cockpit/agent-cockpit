import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { sendWsMessage } from '../../hooks/useSessionEvents.js'
import { getSessionTitle } from '../../lib/sessionTitle.js'
import { useStore } from '../../store/index.js'
import { useFilteredSessions } from '../../store/selectors.js'
import { LoadingSpinner } from '../LoadingSpinner.js'
import { LaunchSessionModal } from '../sessions/LaunchSessionModal.js'
import { SessionCard } from '../sessions/SessionCard.js'
import { SessionFilters } from '../sessions/SessionFilters.js'
import { TerminateSessionDialog } from '../sessions/TerminateSessionDialog.js'

export function SessionListPanel() {
  const wsUnavailableReason = 'Daemon connection is not open. Reconnect and try again.'
  const navigate = useNavigate()
  const sessions = useFilteredSessions()
  const selectedSessionId = useStore((s) => s.selectedSessionId)
  const activeSubagentParents = useStore((s) => s.activeSubagentParents)
  const setHistoryMode = useStore((s) => s.setHistoryMode)
  const closeSessionPopup = useStore((s) => s.closeSessionPopup)
  const sessionsById = useStore((s) => s.sessions)
  const wsStatus = useStore((s) => s.wsStatus)
  const [launchOpen, setLaunchOpen] = useState(false)
  const [terminatingSessionId, setTerminatingSessionId] = useState<string | null>(null)
  const [confirmTerminateSessionId, setConfirmTerminateSessionId] = useState<string | null>(null)
  const [terminateErrors, setTerminateErrors] = useState<Record<string, string>>({})

  function handleCardClick(sessionId: string) {
    useStore.getState().selectSession(sessionId)
    setHistoryMode?.(false)
    navigate('/session/' + sessionId + '/approvals')
  }

  function handleTerminate(sessionId: string): void {
    const session = sessionsById[sessionId]
    if (!session) return

    if (session.canTerminateSession !== true) {
      setTerminateErrors((prev) => ({
        ...prev,
        [sessionId]: session.reason ?? 'Session termination is unavailable for this session.',
      }))
      return
    }
    if (wsStatus !== 'connected') {
      setTerminateErrors((prev) => ({
        ...prev,
        [sessionId]: wsUnavailableReason,
      }))
      return
    }
    setConfirmTerminateSessionId(sessionId)
  }

  function confirmTerminate(): void {
    if (!confirmTerminateSessionId) return

    const session = sessionsById[confirmTerminateSessionId]
    if (!session) {
      setConfirmTerminateSessionId(null)
      return
    }
    if (session.canTerminateSession !== true) {
      setTerminateErrors((prev) => ({
        ...prev,
        [confirmTerminateSessionId]:
          session.reason ?? 'Session termination is unavailable for this session.',
      }))
      setConfirmTerminateSessionId(null)
      return
    }

    setTerminateErrors((prev) => {
      const next = { ...prev }
      delete next[confirmTerminateSessionId]
      return next
    })
    setTerminatingSessionId(confirmTerminateSessionId)
    const queued = sendWsMessage({ type: 'session_terminate', sessionId: confirmTerminateSessionId })
    if (!queued) {
      setTerminateErrors((prev) => ({
        ...prev,
        [confirmTerminateSessionId]: wsUnavailableReason,
      }))
      setTerminatingSessionId(null)
    } else {
      closeSessionPopup(confirmTerminateSessionId)
    }
    setConfirmTerminateSessionId(null)
  }

  useEffect(() => {
    if (!terminatingSessionId) return
    const session = sessionsById[terminatingSessionId]
    if (!session) {
      setTerminatingSessionId(null)
      return
    }
    if (session.status !== 'active') {
      setTerminatingSessionId(null)
      return
    }
    if (session.reason) {
      setTerminateErrors((prev) => ({
        ...prev,
        [terminatingSessionId]: session.reason ?? 'Failed to terminate session.',
      }))
      setTerminatingSessionId(null)
    }
  }, [sessionsById, terminatingSessionId])

  useEffect(() => {
    if (!confirmTerminateSessionId) return
    const session = sessionsById[confirmTerminateSessionId]
    if (!session || session.status !== 'active' || session.canTerminateSession !== true) {
      setConfirmTerminateSessionId(null)
    }
  }, [confirmTerminateSessionId, sessionsById])

  const confirmSession =
    confirmTerminateSessionId ? sessionsById[confirmTerminateSessionId] : undefined
  const confirmSessionName = confirmSession
    ? getSessionTitle(confirmSession.workspacePath, confirmSession.sessionId)
    : 'session'
  const confirmProvider = confirmSession?.provider ?? 'claude'

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {wsStatus === 'connecting' && (
        <div className="flex items-center gap-1 px-3 py-1 text-xs text-muted-foreground">
          <LoadingSpinner className="w-4 h-4" />
          <span>Connecting...</span>
        </div>
      )}
      <SessionFilters />

      <div className="px-3 py-2">
        <button
          type="button"
          onClick={() => setLaunchOpen(true)}
          className="w-full rounded-xl border border-[var(--color-cockpit-accent)]/40 bg-[color-mix(in_srgb,var(--color-cockpit-accent)_8%,transparent)] px-3 py-2 text-sm font-medium text-[var(--color-cockpit-accent)] uppercase tracking-wide hover:bg-[color-mix(in_srgb,var(--color-cockpit-accent)_15%,transparent)] hover:border-[var(--color-cockpit-accent)]/60 transition-colors [font-family:var(--font-sidebar-display)]"
        >
          Launch Session
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <p className="cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }}>-- NO SESSIONS --</p>
            <p className="[font-family:var(--font-mono-data)] text-[10px] text-muted-foreground text-center">
              Launch a session to begin
            </p>
          </div>
        ) : (
          sessions.map((session) => (
            <SessionCard
              key={session.sessionId}
              session={session}
              selected={session.sessionId === selectedSessionId}
              onClick={() => handleCardClick(session.sessionId)}
              onTerminate={() => handleTerminate(session.sessionId)}
              isTerminating={terminatingSessionId === session.sessionId}
              terminateError={terminateErrors[session.sessionId]}
              activeSubagentCount={activeSubagentParents[session.sessionId] ?? 0}
            />
          ))
        )}
      </div>

      <LaunchSessionModal open={launchOpen} onClose={() => setLaunchOpen(false)} />
      <TerminateSessionDialog
        open={confirmSession !== undefined}
        sessionName={confirmSessionName}
        provider={confirmProvider}
        isProcessing={confirmTerminateSessionId !== null && terminatingSessionId === confirmTerminateSessionId}
        onCancel={() => setConfirmTerminateSessionId(null)}
        onConfirm={confirmTerminate}
      />
    </div>
  )
}
