import { useEffect } from 'react'
import type { NormalizedEvent } from '@agentcockpit/shared'
import { useStore } from '../store/index.js'
import { audioSystem } from './audioSystem.js'

function routeEventToAudio(event: NormalizedEvent): void {
  switch (event.type) {
    case 'approval_resolved':
      audioSystem.playApprovalResolved(event.decision)
      return
    case 'session_start':
    case 'subagent_spawn':
      audioSystem.playAgentSpawn()
      return
    case 'session_end':
    case 'subagent_complete':
      audioSystem.playAgentDespawn()
      return
    default:
      return
  }
}

export function useAudioBootstrap(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const unlock = () => {
      if (!audioSystem.unlockFromUserGesture()) return
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('touchstart', unlock)
    }

    window.addEventListener('pointerdown', unlock, { passive: true })
    window.addEventListener('keydown', unlock)
    window.addEventListener('touchstart', unlock, { passive: true })

    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('touchstart', unlock)
    }
  }, [])

  useEffect(() => {
    const seenCounts = new Map<string, number>()
    const initialEvents = useStore.getState().events
    Object.entries(initialEvents).forEach(([sessionId, events]) => {
      seenCounts.set(sessionId, events.length)
    })

    const unsubscribeEvents = useStore.subscribe(
      (state) => state.events,
      (eventsBySession) => {
        Object.entries(eventsBySession).forEach(([sessionId, events]) => {
          const seen = seenCounts.get(sessionId) ?? 0
          for (let i = seen; i < events.length; i++) {
            const event = events[i]
            if (event) routeEventToAudio(event)
          }
          seenCounts.set(sessionId, events.length)
        })

        Array.from(seenCounts.keys()).forEach((sessionId) => {
          if (!(sessionId in eventsBySession)) {
            seenCounts.delete(sessionId)
          }
        })
      },
    )

    const unsubscribePopup = useStore.subscribe(
      (state) => state.sessionDetailOpen,
      (isOpen, wasOpen) => {
        if (typeof wasOpen === 'boolean' && isOpen !== wasOpen) {
          audioSystem.playPopupToggle(isOpen)
        }
      },
    )

    return () => {
      unsubscribeEvents()
      unsubscribePopup()
    }
  }, [])
}
