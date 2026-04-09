import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useStore } from '../../store/index.js'
import { useFilteredSessions } from '../../store/selectors.js'
import { SessionFilters } from '../sessions/SessionFilters.js'
import { SessionCard } from '../sessions/SessionCard.js'
import { LaunchSessionModal } from '../sessions/LaunchSessionModal.js'

export function SessionListPanel() {
  const navigate = useNavigate()
  const sessions = useFilteredSessions()
  const selectedSessionId = useStore((s) => s.selectedSessionId)
  console.log('[DEBUG] sessions:', sessions, 'store sessions:', useStore.getState().sessions, 'wsStatus:', useStore.getState().wsStatus, 'lastSeenSequence:', useStore.getState().lastSeenSequence)
  const [launchOpen, setLaunchOpen] = useState(false)

  function handleCardClick(sessionId: string) {
    useStore.getState().selectSession(sessionId)
    navigate('/session/' + sessionId + '/approvals')
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
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
            />
          ))
        )}
      </div>

      <LaunchSessionModal open={launchOpen} onClose={() => setLaunchOpen(false)} />
    </div>
  )
}
