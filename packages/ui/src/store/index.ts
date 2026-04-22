import type { NormalizedEvent } from '@cockpit/shared'
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import {
    CHARACTER_TYPES,
    type CharacterType,
    drawFromBag,
    newCharacterBag,
} from '../components/office/characterMapping.js'
import type { ApprovalsSlice } from './approvalsSlice.js'
import { applyEventToApprovals } from './approvalsSlice.js'
import { applyEventToEvents } from './eventsSlice.js'
import { applyEventToSessions } from './sessionsSlice.js'

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

export interface SessionPopupWindow {
  sessionId: string
  x: number
  y: number
  width: number
  height: number
  minimized: boolean
  preferredTab: PopupTabId | null
}

export interface SessionPopupWindowPatch {
  x?: number
  y?: number
  width?: number
  height?: number
}

interface SessionsSlice {
  sessions: Record<string, SessionRecord>
  characterBag: CharacterType[]
  subagentSessionIds: Set<string>
  activeSubagentParents: Record<string, number>
  applyEvent: (event: NormalizedEvent) => void
  applyEventsBatch: (events: NormalizedEvent[]) => void
}

interface UiSlice {
  selectedSessionId: string | null
  selectedPlayerCharacter: CharacterType
  activePanel: PanelId
  popupPreferredTab: PopupTabId | null
  popupWindows: Record<string, SessionPopupWindow>
  popupWindowOrder: string[]
  filters: { provider: string | null; status: string | null; search: string }
  sessionDetailOpen: boolean
  selectSession: (id: string) => void
  setSelectedPlayerCharacter: (character: CharacterType) => void
  setActivePanel: (panel: PanelId) => void
  setPopupPreferredTab: (tab: PopupTabId | null) => void
  openSessionPopup: (sessionId: string, options?: { preferredTab?: PopupTabId | null }) => void
  closeSessionPopup: (sessionId: string) => void
  minimizeSessionPopup: (sessionId: string) => void
  restoreSessionPopup: (sessionId: string) => void
  bringSessionPopupToFront: (sessionId: string) => void
  setSessionPopupRect: (sessionId: string, patch: SessionPopupWindowPatch) => void
  clearSessionPopupPreferredTab: (sessionId: string) => void
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
  removeHistorySessions: (sessionIds: string[]) => void
  setHistoryMode: (on: boolean) => void
  toggleCompareSelection: (id: string) => void
}

export type AppStore = SessionsSlice & UiSlice & WsSlice & EventsSlice & HistorySlice & ApprovalsSlice

const POPUP_DEFAULT_WIDTH = 980
const POPUP_DEFAULT_HEIGHT = 640
const POPUP_CASCADE_X = 28
const POPUP_CASCADE_Y = 22
const POPUP_CASCADE_COUNT = 7

function hasVisiblePopup(
  popupWindows: Record<string, SessionPopupWindow>,
  popupWindowOrder: string[],
): boolean {
  return popupWindowOrder.some((sessionId) => !popupWindows[sessionId]?.minimized)
}

function getTopVisiblePopupId(
  popupWindows: Record<string, SessionPopupWindow>,
  popupWindowOrder: string[],
): string | null {
  for (let i = popupWindowOrder.length - 1; i >= 0; i--) {
    const sessionId = popupWindowOrder[i]
    if (!sessionId) continue
    if (!popupWindows[sessionId]?.minimized) return sessionId
  }
  return null
}

function defaultPopupWindow(
  sessionId: string,
  orderLength: number,
  preferredTab: PopupTabId | null,
): SessionPopupWindow {
  const offset = orderLength % POPUP_CASCADE_COUNT
  return {
    sessionId,
    x: 24 + POPUP_CASCADE_X * offset,
    y: 24 + POPUP_CASCADE_Y * offset,
    width: POPUP_DEFAULT_WIDTH,
    height: POPUP_DEFAULT_HEIGHT,
    minimized: false,
    preferredTab,
  }
}

function reduceStoreWithEvent(
  state: Pick<AppStore, 'sessions' | 'events' | 'pendingApprovalsBySession' | 'characterBag' | 'subagentSessionIds' | 'activeSubagentParents'>,
  event: NormalizedEvent,
): Pick<AppStore, 'sessions' | 'events' | 'pendingApprovalsBySession' | 'characterBag' | 'subagentSessionIds' | 'activeSubagentParents'> {
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
  let activeSubagentParents = state.activeSubagentParents
  if (event.type === 'subagent_spawn') {
    subagentSessionIds = new Set(subagentSessionIds)
    subagentSessionIds.add(event.subagentSessionId)
    activeSubagentParents = {
      ...activeSubagentParents,
      [event.sessionId]: (activeSubagentParents[event.sessionId] ?? 0) + 1,
    }
  }
  if (event.type === 'subagent_complete') {
    const next = (activeSubagentParents[event.sessionId] ?? 1) - 1
    activeSubagentParents = { ...activeSubagentParents }
    if (next <= 0) {
      delete activeSubagentParents[event.sessionId]
    } else {
      activeSubagentParents[event.sessionId] = next
    }
  }
  return {
    sessions: sessionsPatch.sessions,
    events: eventsPatch.events,
    pendingApprovalsBySession,
    characterBag,
    subagentSessionIds,
    activeSubagentParents,
  }
}

export const useStore = create<AppStore>()(
  subscribeWithSelector((set) => ({
    // sessionsSlice
    sessions: {},
    characterBag: newCharacterBag(),
    subagentSessionIds: new Set<string>(),
    activeSubagentParents: {},
    applyEvent: (event) =>
      set((state) => reduceStoreWithEvent(state, event)),
    applyEventsBatch: (events) =>
      set((state) => {
        if (events.length === 0) return {}

        let nextState: Pick<AppStore, 'sessions' | 'events' | 'pendingApprovalsBySession' | 'characterBag' | 'subagentSessionIds' | 'activeSubagentParents'> = {
          sessions: state.sessions,
          events: state.events,
          pendingApprovalsBySession: state.pendingApprovalsBySession,
          characterBag: state.characterBag,
          subagentSessionIds: state.subagentSessionIds,
          activeSubagentParents: state.activeSubagentParents,
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
    popupWindows: {},
    popupWindowOrder: [],
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
    openSessionPopup: (sessionId, options) =>
      set((s) => {
        const preferredTab =
          options?.preferredTab !== undefined ? options.preferredTab : s.popupPreferredTab
        const popupWindowOrder = s.popupWindowOrder.filter((id) => id !== sessionId)
        popupWindowOrder.push(sessionId)
        const existing = s.popupWindows[sessionId]
        const popupWindows = {
          ...s.popupWindows,
          [sessionId]: existing
            ? {
                ...existing,
                minimized: false,
                preferredTab:
                  options?.preferredTab !== undefined
                    ? options.preferredTab ?? null
                    : existing.preferredTab,
              }
            : defaultPopupWindow(sessionId, popupWindowOrder.length - 1, preferredTab ?? null),
        }

        return {
          popupWindows,
          popupWindowOrder,
          selectedSessionId: sessionId,
          sessionDetailOpen: true,
          popupPreferredTab: null,
        }
      }),
    closeSessionPopup: (sessionId) =>
      set((s) => {
        if (!s.popupWindows[sessionId]) return {}
        const popupWindows = { ...s.popupWindows }
        delete popupWindows[sessionId]
        const popupWindowOrder = s.popupWindowOrder.filter((id) => id !== sessionId)
        const topVisibleSessionId = getTopVisiblePopupId(popupWindows, popupWindowOrder)
        const fallbackTopSessionId = popupWindowOrder.at(-1) ?? null
        const nextSelectedSessionId =
          s.selectedSessionId === sessionId
            ? topVisibleSessionId ?? fallbackTopSessionId
            : s.selectedSessionId
        return {
          popupWindows,
          popupWindowOrder,
          selectedSessionId: nextSelectedSessionId,
          sessionDetailOpen: hasVisiblePopup(popupWindows, popupWindowOrder),
        }
      }),
    minimizeSessionPopup: (sessionId) =>
      set((s) => {
        const existing = s.popupWindows[sessionId]
        if (!existing || existing.minimized) return {}
        const popupWindows = {
          ...s.popupWindows,
          [sessionId]: { ...existing, minimized: true },
        }
        const topVisibleSessionId = getTopVisiblePopupId(popupWindows, s.popupWindowOrder)
        const nextSelectedSessionId =
          s.selectedSessionId === sessionId ? topVisibleSessionId : s.selectedSessionId
        return {
          popupWindows,
          selectedSessionId: nextSelectedSessionId,
          sessionDetailOpen: hasVisiblePopup(popupWindows, s.popupWindowOrder),
        }
      }),
    restoreSessionPopup: (sessionId) =>
      set((s) => {
        const existing = s.popupWindows[sessionId]
        if (!existing) return {}
        const popupWindowOrder = s.popupWindowOrder.filter((id) => id !== sessionId)
        popupWindowOrder.push(sessionId)
        const popupWindows = {
          ...s.popupWindows,
          [sessionId]: { ...existing, minimized: false },
        }
        return {
          popupWindows,
          popupWindowOrder,
          selectedSessionId: sessionId,
          sessionDetailOpen: true,
        }
      }),
    bringSessionPopupToFront: (sessionId) =>
      set((s) => {
        if (!s.popupWindows[sessionId]) return {}
        const popupWindowOrder = s.popupWindowOrder.filter((id) => id !== sessionId)
        popupWindowOrder.push(sessionId)
        return {
          popupWindowOrder,
          selectedSessionId: sessionId,
        }
      }),
    setSessionPopupRect: (sessionId, patch) =>
      set((s) => {
        const existing = s.popupWindows[sessionId]
        if (!existing) return {}
        return {
          popupWindows: {
            ...s.popupWindows,
            [sessionId]: {
              ...existing,
              x: patch.x ?? existing.x,
              y: patch.y ?? existing.y,
              width: patch.width ?? existing.width,
              height: patch.height ?? existing.height,
            },
          },
        }
      }),
    clearSessionPopupPreferredTab: (sessionId) =>
      set((s) => {
        const existing = s.popupWindows[sessionId]
        if (!existing || existing.preferredTab === null) return {}
        return {
          popupWindows: {
            ...s.popupWindows,
            [sessionId]: {
              ...existing,
              preferredTab: null,
            },
          },
        }
      }),
    setFilter: (key, value) =>
      set((s) => ({ filters: { ...s.filters, [key]: value } })),
    setSessionDetailOpen: (open) =>
      set((s) => {
        if (!open) {
          if (!s.selectedSessionId) {
            return { sessionDetailOpen: false }
          }
          if (!s.popupWindows[s.selectedSessionId]) {
            return { sessionDetailOpen: false }
          }
          const popupWindows = { ...s.popupWindows }
          delete popupWindows[s.selectedSessionId]
          const popupWindowOrder = s.popupWindowOrder.filter(
            (id) => id !== s.selectedSessionId,
          )
          const topVisibleSessionId = getTopVisiblePopupId(popupWindows, popupWindowOrder)
          const fallbackTopSessionId = popupWindowOrder.at(-1) ?? null
          return {
            popupWindows,
            popupWindowOrder,
            selectedSessionId: topVisibleSessionId ?? fallbackTopSessionId,
            sessionDetailOpen: hasVisiblePopup(popupWindows, popupWindowOrder),
          }
        }

        if (!s.selectedSessionId) {
          return { sessionDetailOpen: true }
        }

        const popupWindowOrder = s.popupWindowOrder.filter((id) => id !== s.selectedSessionId)
        popupWindowOrder.push(s.selectedSessionId)
        const existing = s.popupWindows[s.selectedSessionId]
        const popupWindows = {
          ...s.popupWindows,
          [s.selectedSessionId]: existing
            ? {
                ...existing,
                minimized: false,
                preferredTab: s.popupPreferredTab ?? existing.preferredTab,
              }
            : defaultPopupWindow(
                s.selectedSessionId,
                popupWindowOrder.length - 1,
                s.popupPreferredTab,
              ),
        }
        return {
          popupWindows,
          popupWindowOrder,
          sessionDetailOpen: true,
          popupPreferredTab: null,
        }
      }),

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
    removeHistorySessions: (sessionIds) =>
      set((s) => {
        if (sessionIds.length === 0) return {}

        const ids = new Set(sessionIds)
        const nextHistorySessions = { ...s.historySessions }
        ids.forEach((sessionId) => {
          delete nextHistorySessions[sessionId]
        })

        return {
          historySessions: nextHistorySessions,
          compareSelectionIds: s.compareSelectionIds.filter((id) => !ids.has(id)),
        }
      }),
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
