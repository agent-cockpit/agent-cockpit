import type { NormalizedEvent } from '@agentcockpit/shared'
import type { AppStore } from './index.js'

// Module-level constant to avoid creating new [] references for missing sessions
export const EMPTY_EVENTS: NormalizedEvent[] = []

export function getSessionEvents(
  state: Pick<AppStore, 'events'>,
  sessionId: string,
): NormalizedEvent[] {
  return state.events[sessionId] ?? EMPTY_EVENTS
}

export function applyEventToEvents(
  state: Pick<AppStore, 'events'>,
  event: NormalizedEvent,
): Pick<AppStore, 'events'> {
  const sessionId = event.sessionId
  const existing = state.events[sessionId] ?? []
  const seq = (event as NormalizedEvent & { sequenceNumber?: number }).sequenceNumber
  if (
    seq !== undefined &&
    existing.some(
      (e) => (e as NormalizedEvent & { sequenceNumber?: number }).sequenceNumber === seq,
    )
  ) {
    return { events: state.events } // dedup: already present
  }
  return {
    events: {
      ...state.events,
      [sessionId]: [...existing, event],
    },
  }
}
