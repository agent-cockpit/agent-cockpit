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
const {
  selectSessionMock,
  setHistoryModeMock,
  setPopupPreferredTabMock,
  setSessionDetailOpenMock,
} = vi.hoisted(() => ({
  selectSessionMock: vi.fn(),
  setHistoryModeMock: vi.fn(),
  setPopupPreferredTabMock: vi.fn(),
  setSessionDetailOpenMock: vi.fn(),
}))

const storeState = {
  events: {},
  sessions: {},
  pendingApprovalsBySession: {},
  selectedSessionId: null,
  selectedPlayerCharacter: 'astronaut',
  sessionDetailOpen: false,
  selectSession: selectSessionMock,
  setHistoryMode: setHistoryModeMock,
  setPopupPreferredTab: setPopupPreferredTabMock,
  setSessionDetailOpen: setSessionDetailOpenMock,
}
const NPC_POSITION_STORAGE_KEY = 'cockpit.npc.positions.v1'
const PLAYER_STATE_STORAGE_KEY = 'cockpit.player.state.v1'

vi.mock('../../store/index.js', () => {
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

const imageInstances: Array<{
  src: string
  _src: string
  complete: boolean
  naturalWidth: number
  naturalHeight: number
}> = []

class MockImage {
  _src = ''
  complete = true
  naturalWidth = 64
  naturalHeight = 64

  constructor() {
    imageInstances.push(this)
  }

  set src(value: string) {
    this._src = value
  }

  get src() {
    return this._src
  }
}

function stubMapManifestFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith('/maps/maps-manifest.json')) {
      return {
        ok: true,
        json: async () => ({ maps: [] }),
      } as Response
    }

    throw new Error(`Unexpected fetch in OfficePage test: ${String(input)}`)
  }))
}

// Mock InstancePopupHub
vi.mock('../../components/office/InstancePopupHub.js', () => ({
  InstancePopupHub: () => null,
}))

// Mock drawAgentSprite (canvas draw — no-op in tests)
vi.mock('../../components/office/AgentSprite.js', () => ({
  drawAgentSprite: vi.fn(),
}))

import { OfficePage } from '../OfficePage.js'
import { scrollToSession } from '../OfficePage.js'
import { gameState } from '../../game/GameState.js'
import { useActiveSessions } from '../../store/selectors.js'

describe('OfficePage canvas mount', () => {
  beforeEach(() => {
    window.localStorage.clear()
    startMock.mockClear()
    stopMock.mockClear()
    selectSessionMock.mockClear()
    setHistoryModeMock.mockClear()
    storeState.selectedPlayerCharacter = 'astronaut'
    storeState.sessionDetailOpen = false
    imageInstances.length = 0
    setPopupPreferredTabMock.mockClear()
    setSessionDetailOpenMock.mockClear()
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    vi.stubGlobal('Image', MockImage)
    stubMapManifestFetch()
    // Reset npcs and player between tests
    Object.keys(gameState.npcs).forEach(k => delete gameState.npcs[k])
    gameState.player.x = 2 * 96
    gameState.player.y = 5 * 96
    gameState.camera = { x: 0, y: 0, targetX: 0, targetY: 0, viewportW: 400, viewportH: 300, zoom: 2 }
    ;(useActiveSessions as ReturnType<typeof vi.fn>).mockReturnValue([])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a canvas element with data-testid="game-canvas"', () => {
    render(<OfficePage />)
    expect(screen.getByTestId('game-canvas')).toBeInTheDocument()
  })

  it('keeps interact button hidden until a nearby agent is detected', () => {
    render(<OfficePage />)
    const interactButton = screen.getByTestId('interact-button')
    expect(interactButton.parentElement).toHaveStyle({ display: 'none' })
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

    const seededPos = gameState.npcs['test-session-1']
    expect(seededPos).toBeDefined()
    if (!seededPos) return

    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: (seededPos.x + 32) * gameState.camera.zoom,
      clientY: (seededPos.y + 32) * gameState.camera.zoom,
    })
    canvas.dispatchEvent(clickEvent)

    expect(selectSessionMock).toHaveBeenCalledWith('test-session-1')
    expect(setPopupPreferredTabMock).toHaveBeenCalledWith('chat')
    expect(setSessionDetailOpenMock).toHaveBeenCalledWith(true)
  })

  it('canvas click on NPC teleports camera to centre on that NPC (cam.x === cam.targetX)', () => {
    // Reset camera — viewportW/H are zoom-corrected (canvas.width/zoom = 800/2 = 400)
    gameState.camera = { x: 0, y: 0, targetX: 0, targetY: 0, viewportW: 400, viewportH: 300, zoom: 2 }

    render(<OfficePage />)
    // Set NPC AFTER render so the seeding cleanup effect (which deletes NPCs not in activeSessions)
    // does not remove it. useActiveSessions returns [] in this test.
    gameState.npcs['teleport-session'] = { x: 400, y: 300 }
    const canvas = screen.getByTestId('game-canvas')
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 800, bottom: 600,
      width: 800, height: 600, x: 0, y: 0,
      toJSON: () => ({}),
    })

    // Click at screen position (840, 640) — zoom=2 so world coords = (840/2, 640/2) = (420, 320)
    // NPC is at (400, 300), size 64px, so world (420, 320) is inside the sprite
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 840, clientY: 640 })
    canvas.dispatchEvent(clickEvent)

    // Camera must have snapped: cam.x === cam.targetX (instant, no lerp)
    expect(gameState.camera.x).toBe(gameState.camera.targetX)
    expect(gameState.camera.y).toBe(gameState.camera.targetY)
    // Merged avatar-chat behavior snaps camera to NPC origin-based focus helper.
    expect(gameState.camera.targetX).toBe(200)
    expect(gameState.camera.targetY).toBe(150)
    // Player must teleport to NPC position so update() preserves camera target on next tick
    expect(gameState.player.x).toBe(400)
    expect(gameState.player.y).toBe(300)
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

  it('loads the selected character sprite sheet on mount', () => {
    storeState.selectedPlayerCharacter = 'ninja'

    render(<OfficePage />)

    expect(imageInstances.at(-1)?.src).toBe('/sprites/ninja-sheet.png')
  })

  it('updates the player sprite sheet when the selected character changes', () => {
    const { rerender } = render(<OfficePage />)
    expect(imageInstances.at(-1)?.src).toBe('/sprites/astronaut-sheet.png')

    storeState.selectedPlayerCharacter = 'ninja'
    rerender(<OfficePage />)

    expect(imageInstances.at(-1)?.src).toBe('/sprites/ninja-sheet.png')
  })

  it('pressing E near an NPC opens chat popup for that session', () => {
    render(<OfficePage />)
    gameState.player.x = 0
    gameState.player.y = 0
    gameState.npcs['near-session'] = { x: 24, y: 24 }

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }))
    })

    expect(selectSessionMock).toHaveBeenCalledWith('near-session')
    expect(setPopupPreferredTabMock).toHaveBeenCalledWith('chat')
    expect(setSessionDetailOpenMock).toHaveBeenCalledWith(true)
  })

  it('pressing E far from all NPCs does not open popup', () => {
    render(<OfficePage />)
    gameState.player.x = 0
    gameState.player.y = 0
    gameState.npcs['far-session'] = { x: 600, y: 600 }

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }))
    })

    expect(selectSessionMock).not.toHaveBeenCalled()
  })

  it('restores persisted NPC position for a known session id', () => {
    window.localStorage.setItem(
      NPC_POSITION_STORAGE_KEY,
      JSON.stringify({
        'persisted-session': { x: 777, y: 555 },
      }),
    )
    ;(useActiveSessions as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        sessionId: 'persisted-session',
        provider: 'claude',
        workspacePath: '/test',
        startedAt: '2024-01-01T00:00:00Z',
        status: 'active',
        lastEventAt: '2024-01-01T00:01:00Z',
        pendingApprovals: 0,
      },
    ])

    render(<OfficePage />)

    expect(gameState.npcs['persisted-session']).toEqual({ x: 777, y: 555 })
  })

  it('restores persisted player position and direction on mount', () => {
    window.localStorage.setItem(
      PLAYER_STATE_STORAGE_KEY,
      JSON.stringify({ x: 1234, y: 567, direction: 'north-west' }),
    )

    render(<OfficePage />)

    expect(gameState.player.x).toBe(1234)
    expect(gameState.player.y).toBe(567)
    expect(gameState.player.direction).toBe('north-west')
  })
})

describe('OfficePage scrollToSession', () => {
  beforeEach(() => {
    stubMapManifestFetch()
    Object.keys(gameState.npcs).forEach(k => delete gameState.npcs[k])
    gameState.player.x = 2 * 96
    gameState.player.y = 5 * 96
    gameState.camera = { x: 0, y: 0, targetX: 0, targetY: 0, viewportW: 400, viewportH: 300, zoom: 2 }
    ;(useActiveSessions as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        sessionId: 'test-session-1',
        provider: 'claude',
        workspacePath: '/workspace/test',
        startedAt: '2024-01-01T00:00:00Z',
        status: 'active',
        lastEventAt: '2024-01-01T00:01:00Z',
        pendingApprovals: 0,
      },
    ])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('focuses target session by snapping camera to centered coordinates', () => {
    render(<OfficePage />)
    gameState.npcs['test-session-1'] = { x: 400, y: 300 }

    act(() => {
      scrollToSession('test-session-1')
    })

    expect(gameState.camera.targetX).toBe(200)
    expect(gameState.camera.targetY).toBe(150)
    expect(gameState.camera.x).toBe(200)
    expect(gameState.camera.y).toBe(150)
  })

  it('keeps player position synchronized with focused NPC position', () => {
    render(<OfficePage />)
    gameState.npcs['test-session-1'] = { x: 400, y: 300 }

    act(() => {
      scrollToSession('test-session-1')
    })

    expect(gameState.player.x).toBe(400)
    expect(gameState.player.y).toBe(300)
  })

  it('is a safe no-op when the session id is unknown', () => {
    render(<OfficePage />)
    const beforeCamera = { ...gameState.camera }
    const beforePlayer = { x: gameState.player.x, y: gameState.player.y }

    expect(() => {
      act(() => {
        scrollToSession('missing-session')
      })
    }).not.toThrow()

    expect(gameState.camera).toEqual(beforeCamera)
    expect(gameState.player.x).toBe(beforePlayer.x)
    expect(gameState.player.y).toBe(beforePlayer.y)
  })
})
