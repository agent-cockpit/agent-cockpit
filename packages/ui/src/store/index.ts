import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { NormalizedEvent } from '@cockpit/shared'
import { applyEventToSessions } from './sessionsSlice.js'

export type SessionStatus = 'active' | 'ended' | 'error'

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
  activePanel: PanelId
  filters: { provider: string | null; status: string | null; search: string }
  selectSession: (id: string) => void
  setActivePanel: (panel: PanelId) => void
  setFilter: (key: string, value: string | null) => void
}

interface WsSlice {
  wsStatus: 'disconnected' | 'connecting' | 'connected'
  lastSeenSequence: number
  setWsStatus: (s: WsSlice['wsStatus']) => void
  recordSequence: (n: number) => void
}

export type AppStore = SessionsSlice & UiSlice & WsSlice

export const useStore = create<AppStore>()(
  subscribeWithSelector((set) => ({
    // sessionsSlice
    sessions: {},
    applyEvent: (event) => set((state) => applyEventToSessions(state, event)),

    // uiSlice
    selectedSessionId: null,
    activePanel: 'approvals',
    filters: { provider: null, status: null, search: '' },
    selectSession: (id) => set({ selectedSessionId: id }),
    setActivePanel: (panel) => set({ activePanel: panel }),
    setFilter: (key, value) =>
      set((s) => ({ filters: { ...s.filters, [key]: value } })),

    // wsSlice
    wsStatus: 'disconnected',
    lastSeenSequence: 0,
    setWsStatus: (s) => set({ wsStatus: s }),
    recordSequence: (n) => set({ lastSeenSequence: n }),
  }))
)
