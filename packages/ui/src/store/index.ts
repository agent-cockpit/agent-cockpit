import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { NormalizedEvent } from '@cockpit/shared'
import {
  CHARACTER_TYPES,
  type CharacterType,
  newCharacterBag,
  drawFromBag,
} from '../components/office/characterMapping.js'
import { applyEventToSessions } from './sessionsSlice.js'
import { applyEventToEvents } from './eventsSlice.js'
import { applyEventToApprovals } from './approvalsSlice.js'
import type { ApprovalsSlice, PendingApproval } from './approvalsSlice.js'

export type SessionStatus = 'active' | 'ended' | 'error'
export const PLAYER_CHARACTER_STORAGE_KEY = 'cockpit.player.character.v1'
export const SESSION_CHARACTER_STORAGE_KEY = 'cockpit.session.characters.v1'

function isCharacterType(value: string): value is CharacterType {
  return CHARACTER_TYPES.includes(value as CharacterType)
}

function readStoredPlayerCharacter(): CharacterType {
  if (typeof window === 'undefined') {
    return 'astronaut'
  }

  try {
    const storedCharacter = window.localStorage.getItem(
      PLAYER_CHARACTER_STORAGE_KEY
    )
    return storedCharacter && isCharacterType(storedCharacter)
      ? storedCharacter
      : 'astronaut'
  } catch {
    return 'astronaut'
  }
}

function readStoredSessionCharacters(): Record<string, CharacterType> {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(SESSION_CHARACTER_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}

    const normalized: Record<string, CharacterType> = {}
    for (const [sessionId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof sessionId !== 'string' || typeof value !== 'string' || !isCharacterType(value)) continue
      normalized[sessionId] = value
    }
    return normalized
  } catch {
    return {}
  }
}

let sessionCharacterCache: Record<string, CharacterType> | null = null

function getSessionCharacterCache(): Record<string, CharacterType> {
  if (!sessionCharacterCache) {
    sessionCharacterCache = readStoredSessionCharacters()
  }
  return sessionCharacterCache
}

function persistSessionCharacterCache(): void {
  if (typeof window === 'undefined' || !sessionCharacterCache) return
  try {
    window.localStorage.setItem(
      SESSION_CHARACTER_STORAGE_KEY,
      JSON.stringify(sessionCharacterCache),
    )
  } catch {
    // Ignore storage failures and keep in-memory state authoritative.
  }
}

function setStoredSessionCharacter(sessionId: string, character: CharacterType): void {
  const cache = getSessionCharacterCache()
  if (cache[sessionId] === character) return
  cache[sessionId] = character
  persistSessionCharacterCache()
}

function removeStoredSessionCharacter(sessionId: string): void {
  const cache = getSessionCharacterCache()
  if (!(sessionId in cache)) return
  delete cache[sessionId]
  persistSessionCharacterCache()
}

export interface SessionSummary {
  sessionId: string
  provider: string
  workspacePath: string
  startedAt: string
  endedAt: string | null
  approvalCount: number
  filesChanged: number
  capabilities?: {
    managedByDaemon: boolean
    canSendMessage: boolean
    canTerminateSession: boolean
    reason?: string
  }
  finalStatus: 'active' | 'ended' | 'error'
}

export interface SessionRecord {
  sessionId: string
  provider: 'claude' | 'codex'
  workspacePath: string
  startedAt: string
  status: SessionStatus
  lastEventAt: string
  pendingApprovals: number
  character: CharacterType
  managedByDaemon?: boolean
  canSendMessage?: boolean
  canTerminateSession?: boolean
  reason?: string
}

export type PanelId = 'approvals' | 'timeline' | 'diff' | 'memory' | 'artifacts'
export type PopupTabId = PanelId | 'chat'

interface SessionsSlice {
  sessions: Record<string, SessionRecord>
  characterBag: CharacterType[]
  subagentSessionIds: Set<string>
  applyEvent: (event: NormalizedEvent) => void
  applyEventsBatch: (events: NormalizedEvent[]) => void
}

interface UiSlice {
  selectedSessionId: string | null
  selectedPlayerCharacter: CharacterType
  activePanel: PanelId
  popupPreferredTab: PopupTabId | null
  filters: { provider: string | null; status: string | null; search: string }
  sessionDetailOpen: boolean
  selectSession: (id: string) => void
  setSelectedPlayerCharacter: (character: CharacterType) => void
  setActivePanel: (panel: PanelId) => void
  setPopupPreferredTab: (tab: PopupTabId | null) => void
  setFilter: (key: string, value: string | null) => void
  setSessionDetailOpen: (open: boolean) => void
}

interface WsSlice {
  wsStatus: 'disconnected' | 'connecting' | 'connected'
  lastSeenSequence: number
  setWsStatus: (s: WsSlice['wsStatus']) => void
  recordSequence: (n: number) => void
}

interface EventsSlice {
  events: Record<string, NormalizedEvent[]>
  bulkApplyEvents: (sessionId: string, events: NormalizedEvent[]) => void
}

interface HistorySlice {
  historySessions: Record<string, SessionSummary>
  historyMode: boolean
  compareSelectionIds: string[]
  bulkApplySessions: (sessions: SessionSummary[]) => void
  setHistoryMode: (on: boolean) => void
  toggleCompareSelection: (id: string) => void
}

export type AppStore = SessionsSlice & UiSlice & WsSlice & EventsSlice & HistorySlice & ApprovalsSlice

function reduceStoreWithEvent(
  state: Pick<AppStore, 'sessions' | 'events' | 'pendingApprovalsBySession' | 'characterBag' | 'subagentSessionIds'>,
  event: NormalizedEvent,
): Pick<AppStore, 'sessions' | 'events' | 'pendingApprovalsBySession' | 'characterBag' | 'subagentSessionIds'> {
  let characterBag = state.characterBag
  let character: CharacterType | undefined
  if (event.type === 'session_start') {
    const existingCharacter = state.sessions[event.sessionId]?.character
    if (existingCharacter) {
      character = existingCharacter
      setStoredSessionCharacter(event.sessionId, character)
    } else {
      const persistedCharacter = getSessionCharacterCache()[event.sessionId]
      let assignedCharacter: CharacterType
      if (persistedCharacter) {
        assignedCharacter = persistedCharacter
      } else {
        ;[assignedCharacter, characterBag] = drawFromBag(characterBag)
      }
      character = assignedCharacter
      setStoredSessionCharacter(event.sessionId, character)
    }
  } else if (event.type === 'session_end') {
    removeStoredSessionCharacter(event.sessionId)
  }
  const sessionsPatch = applyEventToSessions(state, event, character)
  const eventsPatch = applyEventToEvents(state, event)
  const { pendingApprovalsBySession } = applyEventToApprovals(state, event)
  let subagentSessionIds = state.subagentSessionIds
  if (event.type === 'subagent_spawn') {
    subagentSessionIds = new Set(subagentSessionIds)
    subagentSessionIds.add(event.subagentSessionId)
  }
  return {
    sessions: sessionsPatch.sessions,
    events: eventsPatch.events,
    pendingApprovalsBySession,
    characterBag,
    subagentSessionIds,
  }
}

export const useStore = create<AppStore>()(
  subscribeWithSelector((set) => ({
    // sessionsSlice
    sessions: {},
    characterBag: newCharacterBag(),
    subagentSessionIds: new Set<string>(),
    applyEvent: (event) =>
      set((state) => reduceStoreWithEvent(state, event)),
    applyEventsBatch: (events) =>
      set((state) => {
        if (events.length === 0) return {}

        let nextState: Pick<AppStore, 'sessions' | 'events' | 'pendingApprovalsBySession' | 'characterBag' | 'subagentSessionIds'> = {
          sessions: state.sessions,
          events: state.events,
          pendingApprovalsBySession: state.pendingApprovalsBySession,
          characterBag: state.characterBag,
          subagentSessionIds: state.subagentSessionIds,
        }

        for (const event of events) {
          nextState = reduceStoreWithEvent(nextState, event)
        }

        return nextState
      }),

    // eventsSlice
    events: {},
    bulkApplyEvents: (sessionId, evs) =>
      set((s) => ({ events: { ...s.events, [sessionId]: evs } })),

    // approvalsSlice
    pendingApprovalsBySession: {},
    hydratePendingApprovals: (sessionId, approvals) =>
      set((s) => {
        const sessions = s.sessions[sessionId]
          ? {
              ...s.sessions,
              [sessionId]: { ...s.sessions[sessionId]!, pendingApprovals: approvals.length },
            }
          : s.sessions
        return {
          pendingApprovalsBySession: { ...s.pendingApprovalsBySession, [sessionId]: approvals },
          sessions,
        }
      }),

    // uiSlice
    selectedSessionId: null,
    selectedPlayerCharacter: readStoredPlayerCharacter(),
    activePanel: 'approvals',
    popupPreferredTab: null,
    filters: { provider: null, status: 'active', search: '' },
    sessionDetailOpen: false,
    selectSession: (id) => set({ selectedSessionId: id }),
    setSelectedPlayerCharacter: (character) => {
      try {
        window.localStorage.setItem(PLAYER_CHARACTER_STORAGE_KEY, character)
      } catch {
        // Ignore storage failures and keep in-memory state authoritative.
      }

      set({ selectedPlayerCharacter: character })
    },
    setActivePanel: (panel) => set({ activePanel: panel }),
    setPopupPreferredTab: (tab) => set({ popupPreferredTab: tab }),
    setFilter: (key, value) =>
      set((s) => ({ filters: { ...s.filters, [key]: value } })),
    setSessionDetailOpen: (open) => set({ sessionDetailOpen: open }),

    // wsSlice
    wsStatus: 'disconnected',
    lastSeenSequence: 0,
    setWsStatus: (s) => set({ wsStatus: s }),
    recordSequence: (n) =>
      set((state) => ({ lastSeenSequence: Math.max(state.lastSeenSequence, n) })),

    // historySlice
    historySessions: {},
    historyMode: false,
    compareSelectionIds: [],
    bulkApplySessions: (sessions) =>
      set((s) => ({
        historySessions: {
          ...s.historySessions,
          ...Object.fromEntries(sessions.map((sess) => [sess.sessionId, sess])),
        },
      })),
    setHistoryMode: (on) => set({ historyMode: on }),
    toggleCompareSelection: (id) =>
      set((s) => {
        const current = s.compareSelectionIds
        if (current.includes(id)) {
          return { compareSelectionIds: current.filter((x) => x !== id) }
        }
        // Max 2 selections — replace oldest if already have 2
        const next = current.length >= 2 ? [current[1]!, id] : [...current, id]
        return { compareSelectionIds: next }
      }),
  }))
)
