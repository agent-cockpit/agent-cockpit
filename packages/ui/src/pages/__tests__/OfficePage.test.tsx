import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'

// Track start/stop calls
const startMock = vi.fn()
const stopMock = vi.fn()

// Mock GameEngine module before importing OfficePage
vi.mock('../../game/GameEngine.js', () => {
  return {
    GameEngine: class MockGameEngine {
      constructor(_canvas: HTMLCanvasElement) {}
      start() { startMock() }
      stop() { stopMock() }
      update(_deltaMs: number) {}
      render() {}
    },
  }
})

// Hoist selectSession/setHistoryMode mocks so they're available inside vi.mock factories
const { selectSessionMock, setHistoryModeMock } = vi.hoisted(() => ({
  selectSessionMock: vi.fn(),
  setHistoryModeMock: vi.fn(),
}))

vi.mock('../../store/index.js', () => {
  const storeState = {
    events: {},
    sessions: {},
    selectedSessionId: null,
    selectSession: selectSessionMock,
    setHistoryMode: setHistoryModeMock,
  }
  const useStore = vi.fn((selector: (s: typeof storeState) => unknown) => selector(storeState))
  // Attach getState for canvas click handler usage
  ;(useStore as unknown as { getState: () => typeof storeState }).getState = () => storeState
  return { useStore }
})

vi.mock('../../store/selectors.js', () => ({
  useActiveSessions: vi.fn(() => []),
}))

// Mock ResizeObserver in jsdom
class MockResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

// Mock canvas 2d context — jsdom doesn't implement it
const mockCtx = {
  clearRect: vi.fn(),
  drawImage: vi.fn(),
}
HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx) as unknown as typeof HTMLCanvasElement.prototype.getContext

// Mock InstancePopupHub
vi.mock('../../components/office/InstancePopupHub.js', () => ({
  InstancePopupHub: () => null,
}))

// Mock drawAgentSprite (canvas draw — no-op in tests)
vi.mock('../../components/office/AgentSprite.js', () => ({
  drawAgentSprite: vi.fn(),
}))

import { OfficePage } from '../OfficePage.js'
import { gameState } from '../../game/GameState.js'

describe('OfficePage canvas mount', () => {
  beforeEach(() => {
    startMock.mockClear()
    stopMock.mockClear()
    selectSessionMock.mockClear()
    setHistoryModeMock.mockClear()
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    // Reset npcs between tests
    Object.keys(gameState.npcs).forEach(k => delete gameState.npcs[k])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a canvas element with data-testid="game-canvas"', () => {
    render(<OfficePage />)
    expect(screen.getByTestId('game-canvas')).toBeInTheDocument()
  })

  it('canvas is inside the data-testid="office-canvas" container', () => {
    render(<OfficePage />)
    const container = screen.getByTestId('office-canvas')
    const canvas = screen.getByTestId('game-canvas')
    expect(container).toContainElement(canvas)
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

  it('no DnD wrapper is rendered — no @dnd-kit aria attributes', () => {
    const { container } = render(<OfficePage />)
    // DndContext renders a div with data-dnd-context-id — confirm absence
    const dndElements = container.querySelectorAll('[data-dnd-context-id]')
    expect(dndElements.length).toBe(0)
  })

  it('no agent sprite divs are rendered via React (queryAllByTestId returns [])', () => {
    const { queryAllByTestId } = render(<OfficePage />)
    // Old pattern was agent-sprite-{id}, canvas approach renders nothing to DOM
    const sprites = queryAllByTestId(/^agent-sprite-/)
    expect(sprites).toHaveLength(0)
  })

  it('canvas click at NPC position calls selectSession with correct id', async () => {
    // Make useActiveSessions return a session so the seeding effect keeps it alive
    const { useActiveSessions } = await import('../../store/selectors.js')
    ;(useActiveSessions as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        sessionId: 'test-session-1',
        provider: 'claude',
        workspacePath: '/test',
        startedAt: '2024-01-01T00:00:00Z',
        status: 'active',
        lastEventAt: '2024-01-01T00:01:00Z',
        pendingApprovals: 0,
      },
    ])

    act(() => { render(<OfficePage />) })

    const canvas = screen.getByTestId('game-canvas')

    // Mock getBoundingClientRect so click coordinates map correctly
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 800, bottom: 600,
      width: 800, height: 600,
      x: 0, y: 0,
      toJSON: () => ({}),
    })

    // gameState.npcs['test-session-1'] is seeded by the component effect at index 0
    // → x: 0, y: 0 (COLS=5, CELL=96 but session is at i=0)
    // Sprite at (0,0), click at (30, 30) — within 64px sprite
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 30, clientY: 30 })
    canvas.dispatchEvent(clickEvent)

    expect(selectSessionMock).toHaveBeenCalledWith('test-session-1')
  })

  it('canvas click on NPC teleports camera to centre on that NPC (cam.x === cam.targetX)', () => {
    // Place NPC at a known position away from world origin
    gameState.npcs['teleport-session'] = { x: 400, y: 300 }
    // Reset camera
    gameState.camera = { x: 0, y: 0, targetX: 0, targetY: 0, viewportW: 800, viewportH: 600 }

    render(<OfficePage />)
    const canvas = screen.getByTestId('game-canvas')
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 800, bottom: 600,
      width: 800, height: 600, x: 0, y: 0,
      toJSON: () => ({}),
    })

    // Click at screen position (420, 320) — with camera at (0,0), world coords = (420, 320)
    // NPC is at (400, 300), size 64px, so (420, 320) is inside the sprite
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 420, clientY: 320 })
    canvas.dispatchEvent(clickEvent)

    // Camera must have snapped: cam.x === cam.targetX (instant, no lerp)
    expect(gameState.camera.x).toBe(gameState.camera.targetX)
    expect(gameState.camera.y).toBe(gameState.camera.targetY)
    // targetX should be clamped and centred on NPC x=400
    // targetX = clamp(400 - 800/2, 0, WORLD_W - 800) = clamp(0, 0, 1120) = 0
    expect(gameState.camera.targetX).toBe(0)
  })

  it('canvas click outside any NPC does not call selectSession', () => {
    gameState.npcs['test-session-2'] = { x: 10, y: 10 }

    render(<OfficePage />)
    const canvas = screen.getByTestId('game-canvas')
    canvas.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 800, bottom: 600,
      width: 800, height: 600,
      x: 0, y: 0,
      toJSON: () => ({}),
    })

    // Click at (200, 200) — well outside the 64px sprite at (10, 10)
    fireEvent.click(canvas, { clientX: 200, clientY: 200 })
    expect(selectSessionMock).not.toHaveBeenCalled()
  })
})
