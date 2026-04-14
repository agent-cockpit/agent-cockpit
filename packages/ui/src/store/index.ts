import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { NormalizedEvent } from '@cockpit/shared'
import { applyEventToSessions } from './sessionsSlice.js'
import { applyEventToEvents } from './eventsSlice.js'
import { applyEventToApprovals } from './approvalsSlice.js'
import type { ApprovalsSlice } from './approvalsSlice.js'

export type SessionStatus = 'active' | 'ended' | 'error'

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
  managedByDaemon?: boolean
  canSendMessage?: boolean
  canTerminateSession?: boolean
  reason?: string
}

export type PanelId = 'approvals' | 'timeline' | 'diff' | 'memory' | 'artifacts'
export type PopupTabId = PanelId | 'chat'

interface SessionsSlice {
  sessions: Record<string, SessionRecord>
  applyEvent: (event: NormalizedEvent) => void
}

interface UiSlice {
  selectedSessionId: string | null
  activePanel: PanelId
  popupPreferredTab: PopupTabId | null
  filters: { provider: string | null; status: string | null; search: string }
  sessionDetailOpen: boolean
  selectSession: (id: string) => void
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

export const useStore = create<AppStore>()(
  subscribeWithSelector((set) => ({
    // sessionsSlice
    sessions: {},
    applyEvent: (event) =>
      set((state) => {
        const sessionsPatch = applyEventToSessions(state, event)
        const eventsPatch = applyEventToEvents(state, event)
        const { pendingApprovalsBySession } = applyEventToApprovals(state, event)
        return { ...sessionsPatch, ...eventsPatch, pendingApprovalsBySession }
      }),

    // eventsSlice
    events: {},
    bulkApplyEvents: (sessionId, evs) =>
      set((s) => ({ events: { ...s.events, [sessionId]: evs } })),

    // approvalsSlice
    pendingApprovalsBySession: {},

    // uiSlice
    selectedSessionId: null,
    activePanel: 'approvals',
    popupPreferredTab: null,
    filters: { provider: null, status: null, search: '' },
    sessionDetailOpen: false,
    selectSession: (id) => set({ selectedSessionId: id }),
    setActivePanel: (panel) => set({ activePanel: panel }),
    setPopupPreferredTab: (tab) => set({ popupPreferredTab: tab }),
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
