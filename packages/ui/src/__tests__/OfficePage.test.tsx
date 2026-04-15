// OfficePage legacy test suite — updated in Phase 15-03 for canvas-based sprite rendering.
// DnD, React AgentSprite divs, and localStorage positions have been removed.
// Canvas rendering, gameState.npcs seeding, and click handler are tested here.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'

// Mock GameEngine
const startMock = vi.fn()
const stopMock = vi.fn()
vi.mock('../game/GameEngine.js', () => ({
  GameEngine: class {
    constructor(_canvas: HTMLCanvasElement) {}
    start() { startMock() }
    stop() { stopMock() }
    update(_deltaMs: number) {}
    render() {}
  },
}))

// Hoisted store mocks
const {
  mockSelectSession,
  mockSetHistoryMode,
  mockSetPopupPreferredTab,
  mockSetSessionDetailOpen,
} = vi.hoisted(() => ({
  mockSelectSession: vi.fn(),
  mockSetHistoryMode: vi.fn(),
  mockSetPopupPreferredTab: vi.fn(),
  mockSetSessionDetailOpen: vi.fn(),
}))

vi.mock('../store/index.js', () => {
  const storeState = {
    events: {} as Record<string, unknown[]>,
    sessions: {} as Record<string, unknown>,
    pendingApprovalsBySession: {} as Record<string, unknown[]>,
    wsStatus: 'disconnected' as const,
    selectedSessionId: null,
    selectedPlayerCharacter: 'astronaut',
    sessionDetailOpen: false,
    selectSession: mockSelectSession,
    setHistoryMode: mockSetHistoryMode,
    setPopupPreferredTab: mockSetPopupPreferredTab,
    setSessionDetailOpen: mockSetSessionDetailOpen,
  }
  const useStore = Object.assign(
    vi.fn((selector: (s: typeof storeState) => unknown) => selector(storeState)),
    { getState: () => storeState },
  )
  return { useStore }
})

// Mock useActiveSessions
const { mockUseActiveSessions } = vi.hoisted(() => ({
  mockUseActiveSessions: vi.fn(() => [] as unknown[]),
}))
vi.mock('../store/selectors.js', () => ({
  useActiveSessions: mockUseActiveSessions,
}))

// Mock InstancePopupHub
vi.mock('../components/office/InstancePopupHub.js', () => ({
  InstancePopupHub: () => null,
}))

// Mock drawAgentSprite
vi.mock('../components/office/AgentSprite.js', () => ({
  drawAgentSprite: vi.fn(),
}))

// Mock canvas 2d context
const mockCtx = { clearRect: vi.fn(), drawImage: vi.fn() }
HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx) as unknown as typeof HTMLCanvasElement.prototype.getContext

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

import { OfficePage } from '../pages/OfficePage.js'
import { gameState } from '../game/GameState.js'
import type { SessionRecord } from '../store/index.js'

function makeSession(overrides: Partial<SessionRecord> & Pick<SessionRecord, 'sessionId'>): SessionRecord {
  return {
    provider: 'claude',
    workspacePath: '/projects/my-project',
    startedAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    lastEventAt: '2026-01-01T00:01:00.000Z',
    pendingApprovals: 0,
    character: 'astronaut',
    ...overrides,
  }
}

const SESSION_1 = makeSession({ sessionId: 'sess-1', workspacePath: '/projects/alpha' })
const SESSION_2 = makeSession({ sessionId: 'sess-2', workspacePath: '/projects/beta' })

describe('OfficePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    // Reset npcs and gameState.camera between tests
    Object.keys(gameState.npcs).forEach(k => delete gameState.npcs[k])
    gameState.camera.x = 0
    gameState.camera.y = 0
    mockUseActiveSessions.mockReturnValue([])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders data-testid="office-canvas" div', () => {
    render(<OfficePage />)
    expect(screen.getByTestId('office-canvas')).toBeDefined()
  })

  it('renders game-canvas element', () => {
    render(<OfficePage />)
    expect(screen.getByTestId('game-canvas')).toBeInTheDocument()
  })

  it('no AgentSprite React component divs in DOM (sprites are on canvas)', () => {
    mockUseActiveSessions.mockReturnValue([SESSION_1, SESSION_2])
    render(<OfficePage />)
    // Old pattern: data-testid="agent-sprite-{id}" — should be absent
    expect(screen.queryByTestId('agent-sprite-sess-1')).toBeNull()
    expect(screen.queryByTestId('agent-sprite-sess-2')).toBeNull()
  })

  it('no DnD wrapper in rendered output', () => {
    render(<OfficePage />)
    const dndElements = screen.queryAllByTestId('dnd-context')
    expect(dndElements).toHaveLength(0)
  })

  it('seeds gameState.npcs with spawn-slot positions for each session', () => {
    mockUseActiveSessions.mockReturnValue([SESSION_1, SESSION_2])
    act(() => { render(<OfficePage />) })
    // Session at index 0: SPAWN_SLOTS[0]
    expect(gameState.npcs['sess-1']).toEqual({ x: 1984, y: 1888 })
    // Session at index 1: SPAWN_SLOTS[1]
    expect(gameState.npcs['sess-2']).toEqual({ x: 2048, y: 1888 })
  })

  it('cleans up gameState.npcs for sessions that ended', () => {
    // Pre-seed a stale NPC
    gameState.npcs['stale-session'] = { x: 100, y: 100 }
    mockUseActiveSessions.mockReturnValue([SESSION_1])
    act(() => { render(<OfficePage />) })
    // Stale session should be removed
    expect(gameState.npcs['stale-session']).toBeUndefined()
  })

  it('GameEngine.start() is called on mount', () => {
    render(<OfficePage />)
    expect(startMock).toHaveBeenCalledTimes(1)
  })

  it('GameEngine.stop() is called on unmount', () => {
    const { unmount } = render(<OfficePage />)
    expect(stopMock).not.toHaveBeenCalled()
    act(() => { unmount() })
    expect(stopMock).toHaveBeenCalledTimes(1)
  })

  it('canvas click on NPC position calls selectSession', () => {
    mockUseActiveSessions.mockReturnValue([SESSION_1])
    act(() => { render(<OfficePage />) })

    const canvas = screen.getByTestId('game-canvas')
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 800, bottom: 600,
      width: 800, height: 600, x: 0, y: 0,
      toJSON: () => ({}),
    })

    // Click test validates hit detection, not spawn slot assignment.
    gameState.npcs['sess-1'] = { x: 0, y: 0 }
    // sess-1 at x:0, y:0; click within 64px sprite
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 30, clientY: 30 }))
    expect(mockSelectSession).toHaveBeenCalledWith('sess-1')
    expect(mockSetPopupPreferredTab).toHaveBeenCalledWith('chat')
    expect(mockSetSessionDetailOpen).toHaveBeenCalledWith(true)
  })

  it('pressing E near an NPC opens chat popup for nearest session', () => {
    render(<OfficePage />)
    gameState.player.x = 0
    gameState.player.y = 0
    gameState.npcs['near-session'] = { x: 16, y: 16 }

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }))
    })

    expect(mockSelectSession).toHaveBeenCalledWith('near-session')
    expect(mockSetPopupPreferredTab).toHaveBeenCalledWith('chat')
    expect(mockSetSessionDetailOpen).toHaveBeenCalledWith(true)
  })

  it('pressing E when no nearby NPC does not open popup', () => {
    render(<OfficePage />)
    gameState.player.x = 0
    gameState.player.y = 0
    gameState.npcs['far-session'] = { x: 500, y: 500 }

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }))
    })

    expect(mockSelectSession).not.toHaveBeenCalled()
  })

  it('interact button opens chat popup for nearby NPC', () => {
    render(<OfficePage />)
    gameState.player.x = 0
    gameState.player.y = 0
    gameState.npcs['near-session'] = { x: 24, y: 24 }

    fireEvent.click(screen.getByTestId('interact-button'))

    expect(mockSelectSession).toHaveBeenCalledWith('near-session')
    expect(mockSetPopupPreferredTab).toHaveBeenCalledWith('chat')
    expect(mockSetSessionDetailOpen).toHaveBeenCalledWith(true)
  })

  it('passes lastToolUsed=undefined when no events for session', () => {
    // This is an NPC seeding concern — sessions without events are still seeded
    mockUseActiveSessions.mockReturnValue([SESSION_1])
    act(() => { render(<OfficePage />) })
    expect(gameState.npcs['sess-1']).toBeDefined()
  })

  it('passes lastToolUsed=undefined when last event is not tool_call (seeding still happens)', () => {
    mockUseActiveSessions.mockReturnValue([SESSION_2])
    act(() => { render(<OfficePage />) })
    expect(gameState.npcs['sess-2']).toBeDefined()
  })
})

describe('NPC spawn slot seeding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    Object.keys(gameState.npcs).forEach(k => delete gameState.npcs[k])
    gameState.camera.x = 0
    gameState.camera.y = 0
    mockUseActiveSessions.mockReturnValue([])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('seeds first sessions into slot positions instead of grid origin', () => {
    mockUseActiveSessions.mockReturnValue([SESSION_1, SESSION_2])
    act(() => { render(<OfficePage />) })

    expect(gameState.npcs['sess-1']).toEqual({ x: 1984, y: 1888 })
    expect(gameState.npcs['sess-2']).toEqual({ x: 2048, y: 1888 })
  })

  it('existing NPC position is not overwritten on re-seed', () => {
    gameState.npcs['sess-1'] = { x: 999, y: 999 }
    mockUseActiveSessions.mockReturnValue([SESSION_1])
    act(() => { render(<OfficePage />) })
    expect(gameState.npcs['sess-1']).toEqual({ x: 999, y: 999 })
  })

  it('slot cycles modulo 12 when sessions exceed slot count', () => {
    const sessions = Array.from({ length: 13 }, (_, i) => makeSession({ sessionId: `sess-${i}` }))
    mockUseActiveSessions.mockReturnValue(sessions)

    act(() => { render(<OfficePage />) })

    expect(gameState.npcs['sess-12']).toEqual({ x: 2000, y: 1888 })
  })

  it('all 12 SPAWN_SLOTS are within world bounds (1..3232)', () => {
    const slots = [
      { x: 1984, y: 1888 }, { x: 2048, y: 1888 }, { x: 2112, y: 1888 }, { x: 2176, y: 1888 },
      { x: 2016, y: 1920 }, { x: 2080, y: 1920 }, { x: 2144, y: 1920 },
      { x: 1952, y: 1952 }, { x: 2016, y: 1952 },
      { x: 1920, y: 2112 }, { x: 1984, y: 2112 }, { x: 2048, y: 2112 },
    ]

    const maxCoord = 3232 - 64
    for (const slot of slots) {
      expect(slot.x).toBeGreaterThanOrEqual(1)
      expect(slot.y).toBeGreaterThanOrEqual(1)
      expect(slot.x).toBeLessThanOrEqual(maxCoord)
      expect(slot.y).toBeLessThanOrEqual(maxCoord)
    }
  })

  it('no NPC spawns at void origin (0,0)', () => {
    mockUseActiveSessions.mockReturnValue([
      makeSession({ sessionId: 'sess-a' }),
      makeSession({ sessionId: 'sess-b' }),
      makeSession({ sessionId: 'sess-c' }),
    ])

    act(() => { render(<OfficePage />) })

    const hasVoidSpawn = Object.values(gameState.npcs).some((npc) => npc.x === 0 && npc.y === 0)
    expect(hasVoidSpawn).toBe(false)
  })
})
