import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useStore } from '../../store/index.js'
import { useFilteredSessions } from '../../store/selectors.js'
import { sendWsMessage } from '../../hooks/useSessionEvents.js'
import { SessionFilters } from '../sessions/SessionFilters.js'
import { SessionCard } from '../sessions/SessionCard.js'
import { LaunchSessionModal } from '../sessions/LaunchSessionModal.js'
import { TerminateSessionDialog } from '../sessions/TerminateSessionDialog.js'
import { LoadingSpinner } from '../LoadingSpinner.js'

export function SessionListPanel() {
  const wsUnavailableReason = 'Daemon connection is not open. Reconnect and try again.'
  const navigate = useNavigate()
  const sessions = useFilteredSessions()
  const selectedSessionId = useStore((s) => s.selectedSessionId)
  const activeSubagentParents = useStore((s) => s.activeSubagentParents)
  const setHistoryMode = useStore((s) => s.setHistoryMode)
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
    ? confirmSession.workspacePath.split('/').at(-1) ?? confirmSession.workspacePath
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
          className="w-full rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          Launch Session
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {sessions.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">No sessions</p>
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
