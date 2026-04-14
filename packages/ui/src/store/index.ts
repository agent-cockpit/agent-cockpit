import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { NormalizedEvent } from '@cockpit/shared'
import {
  CHARACTER_TYPES,
  type CharacterType,
} from '../components/office/characterMapping.js'
import { applyEventToSessions } from './sessionsSlice.js'
import { applyEventToEvents } from './eventsSlice.js'
import { applyEventToApprovals } from './approvalsSlice.js'
import type { ApprovalsSlice } from './approvalsSlice.js'

export type SessionStatus = 'active' | 'ended' | 'error'
export const PLAYER_CHARACTER_STORAGE_KEY = 'cockpit.player.character.v1'

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

export interface SessionSummary {
  sessionId: string
  provider: string
  workspacePath: string
  startedAt: string
  endedAt: string | null
  approvalCount: number
  filesChanged: number
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
}

export type PanelId = 'approvals' | 'timeline' | 'diff' | 'memory' | 'artifacts'

interface SessionsSlice {
  sessions: Record<string, SessionRecord>
  applyEvent: (event: NormalizedEvent) => void
}

interface UiSlice {
  selectedSessionId: string | null
  selectedPlayerCharacter: CharacterType
  activePanel: PanelId
  filters: { provider: string | null; status: string | null; search: string }
  sessionDetailOpen: boolean
  selectSession: (id: string) => void
  setSelectedPlayerCharacter: (character: CharacterType) => void
  setActivePanel: (panel: PanelId) => void
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

export const useStore = create<AppStore>()(
  subscribeWithSelector((set) => ({
    // sessionsSlice
    sessions: {},
    applyEvent: (event) =>
      set((state) => ({
        ...applyEventToSessions(state, event),
        ...applyEventToEvents(state, event),
        ...applyEventToApprovals(state, event),
      })),

    // eventsSlice
    events: {},
    bulkApplyEvents: (sessionId, evs) =>
      set((s) => ({ events: { ...s.events, [sessionId]: evs } })),

    // approvalsSlice
    pendingApprovalsBySession: {},

    // uiSlice
    selectedSessionId: null,
    selectedPlayerCharacter: readStoredPlayerCharacter(),
    activePanel: 'approvals',
    filters: { provider: null, status: null, search: '' },
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
    setFilter: (key, value) =>
      set((s) => ({ filters: { ...s.filters, [key]: value } })),
    setSessionDetailOpen: (open) => set({ sessionDetailOpen: open }),

    // wsSlice
    wsStatus: 'disconnected',
    lastSeenSequence: 0,
    setWsStatus: (s) => set({ wsStatus: s }),
    recordSequence: (n) => set({ lastSeenSequence: n }),

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
