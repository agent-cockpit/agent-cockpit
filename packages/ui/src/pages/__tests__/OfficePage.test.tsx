import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'

const { engineInstances, stepNpcBehaviorsMock } = vi.hoisted(() => ({
  engineInstances: [] as Array<{ update: (deltaMs: number) => void; render: () => void }>,
  stepNpcBehaviorsMock: vi.fn((input: {
    sessions: ReadonlyArray<{ sessionId: string; pendingApprovals?: number }>
    positions: Record<string, { x: number; y: number }>
    pausedSessionIds?: ReadonlySet<string>
    runtimeBySession?: Record<string, unknown>
  }) => {
    const nextPositions: Record<string, { x: number; y: number }> = {}
    const nextRuntimeBySession: Record<string, unknown> = {}
    for (const [sessionId, pos] of Object.entries(input.positions)) {
      nextRuntimeBySession[sessionId] = input.runtimeBySession?.[sessionId] ?? {
        mode: input.pausedSessionIds?.has(sessionId) ? 'paused' : 'wander',
        target: null,
        path: [],
        pathIndex: 0,
        velocity: { x: 0, y: 0 },
        nextDecisionAtMs: 0,
        lastProgressAtMs: 0,
        stuckSinceMs: 0,
        failedReplans: 0,
        seed: 1,
      }
      if (input.pausedSessionIds?.has(sessionId)) {
        nextPositions[sessionId] = { x: pos.x, y: pos.y }
      } else {
        nextPositions[sessionId] = { x: pos.x + 12, y: pos.y + 4 }
      }
    }
    return { positions: nextPositions, modes: {}, runtimeBySession: nextRuntimeBySession }
  }),
}))

// Track start/stop calls
const startMock = vi.fn()
const stopMock = vi.fn()

// Mock GameEngine module before importing OfficePage
vi.mock('../../game/GameEngine.js', () => {
  return {
    GameEngine: class MockGameEngine {
      constructor(_canvas: HTMLCanvasElement) {
        engineInstances.push(this as unknown as { update: (deltaMs: number) => void; render: () => void })
      }
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

interface MockStoreState {
  events: Record<string, unknown[]>
  sessions: Record<string, unknown>
  historySessions: Record<string, unknown>
  pendingApprovalsBySession: Record<string, unknown[]>
  popupWindows: Record<string, unknown>
  popupWindowOrder: string[]
  selectedSessionId: string | null
  selectedPlayerCharacter: string
  sessionDetailOpen: boolean
  selectSession: ReturnType<typeof vi.fn>
  setHistoryMode: ReturnType<typeof vi.fn>
  setPopupPreferredTab: ReturnType<typeof vi.fn>
  setSessionDetailOpen: ReturnType<typeof vi.fn>
  closeSessionPopup: ReturnType<typeof vi.fn>
  minimizeSessionPopup: ReturnType<typeof vi.fn>
  restoreSessionPopup: ReturnType<typeof vi.fn>
  bringSessionPopupToFront: ReturnType<typeof vi.fn>
  setSessionPopupRect: ReturnType<typeof vi.fn>
  clearSessionPopupPreferredTab: ReturnType<typeof vi.fn>
}

const storeState: MockStoreState = {
  events: {},
  sessions: {},
  historySessions: {},
  pendingApprovalsBySession: {},
  popupWindows: {},
  popupWindowOrder: [],
  selectedSessionId: null,
  selectedPlayerCharacter: 'astronaut',
  sessionDetailOpen: false,
  selectSession: selectSessionMock,
  setHistoryMode: setHistoryModeMock,
  setPopupPreferredTab: setPopupPreferredTabMock,
  setSessionDetailOpen: setSessionDetailOpenMock,
  closeSessionPopup: vi.fn(),
  minimizeSessionPopup: vi.fn(),
  restoreSessionPopup: vi.fn(),
  bringSessionPopupToFront: vi.fn(),
  setSessionPopupRect: vi.fn(),
  clearSessionPopupPreferredTab: vi.fn(),
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

vi.mock('../../game/NpcBehavior.js', () => ({
  stepNpcBehaviors: stepNpcBehaviorsMock,
  NPC_SPRITE_SIZE_PX: 64,
}))

import { OfficePage } from '../OfficePage.js'
import { scrollToSession } from '../OfficePage.js'
import { gameState } from '../../game/GameState.js'
import { useActiveSessions } from '../../store/selectors.js'
import { CollisionMap, PLAYER_HITBOX } from '../../game/CollisionMap.js'

const PLAYER_SPRITE_SIZE_PX = 64

function hitboxesOverlap(
  playerPos: { x: number; y: number },
  npcPos: { x: number; y: number },
): boolean {
  const player = {
    x: playerPos.x + PLAYER_HITBOX.offsetX,
    y: playerPos.y + PLAYER_HITBOX.offsetY,
    w: PLAYER_HITBOX.w,
    h: PLAYER_HITBOX.h,
  }
  const npc = {
    x: npcPos.x + PLAYER_HITBOX.offsetX,
    y: npcPos.y + PLAYER_HITBOX.offsetY,
    w: PLAYER_HITBOX.w,
    h: PLAYER_HITBOX.h,
  }

  return (
    player.x < npc.x + npc.w &&
    player.x + player.w > npc.x &&
    player.y < npc.y + npc.h &&
    player.y + player.h > npc.y
  )
}

function spriteRectsOverlap(
  playerPos: { x: number; y: number },
  npcPos: { x: number; y: number },
): boolean {
  return (
    playerPos.x < npcPos.x + PLAYER_SPRITE_SIZE_PX &&
    playerPos.x + PLAYER_SPRITE_SIZE_PX > npcPos.x &&
    playerPos.y < npcPos.y + PLAYER_SPRITE_SIZE_PX &&
    playerPos.y + PLAYER_SPRITE_SIZE_PX > npcPos.y
  )
}

function runEngineFrame(deltaMs = 16): void {
  const engine = engineInstances.at(-1)
  if (!engine) {
    throw new Error('Engine instance not created')
  }
  act(() => {
    engine.update(deltaMs)
  })
}

describe('OfficePage canvas mount', () => {
  beforeEach(() => {
    window.localStorage.clear()
    startMock.mockClear()
    stopMock.mockClear()
    stepNpcBehaviorsMock.mockClear()
    engineInstances.length = 0
    selectSessionMock.mockClear()
    setHistoryModeMock.mockClear()
    storeState.sessions = {}
    storeState.historySessions = {}
    storeState.pendingApprovalsBySession = {}
    storeState.popupWindows = {}
    storeState.popupWindowOrder = []
    storeState.selectedSessionId = null
    storeState.selectedPlayerCharacter = 'astronaut'
    storeState.sessionDetailOpen = false
    imageInstances.length = 0
    setPopupPreferredTabMock.mockClear()
    setSessionDetailOpenMock.mockClear()
    storeState.closeSessionPopup.mockClear()
    storeState.minimizeSessionPopup.mockClear()
    storeState.restoreSessionPopup.mockClear()
    storeState.bringSessionPopupToFront.mockClear()
    storeState.setSessionPopupRect.mockClear()
    storeState.clearSessionPopupPreferredTab.mockClear()
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    vi.stubGlobal('Image', MockImage)
    stubMapManifestFetch()
    // Reset npcs and player between tests
    Object.keys(gameState.npcs).forEach(k => delete gameState.npcs[k])
    gameState.player.x = 2 * 96
    gameState.player.y = 5 * 96
    gameState.tick = 0
    gameState.worldTimeMs = 0
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

  it('labels the office canvas region and map image for assistive technology', () => {
    render(<OfficePage />)
    expect(screen.getByRole('region', { name: /office workspace/i })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /pixel office map with agent positions/i })).toBeInTheDocument()
    expect(screen.getByText(/spatial office view for active agents/i)).toHaveClass('sr-only')
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

  it('shows ended popup dock sessions with an ended status dot', () => {
    storeState.sessions = {
      'ended-session': {
        sessionId: 'ended-session',
        provider: 'claude',
        workspacePath: '/workspace/ended',
        status: 'ended',
        startedAt: '2026-01-01T00:00:00.000Z',
        lastEventAt: '2026-01-01T00:10:00.000Z',
        pendingApprovals: 0,
        character: 'astronaut',
      },
    }
    storeState.popupWindows = {
      'ended-session': {
        sessionId: 'ended-session',
        x: 10,
        y: 10,
        width: 900,
        height: 600,
        minimized: true,
        preferredTab: 'timeline',
      },
    }
    storeState.popupWindowOrder = ['ended-session']

    render(<OfficePage />)

    const dot = screen.getByTestId('popup-dock-status-ended-session')
    expect(dot).toHaveAttribute('data-status', 'ended')
    expect(dot).toHaveClass('bg-gray-400')
    expect(dot).not.toHaveClass('bg-green-400')
    expect(screen.getByRole('button', { name: /restore ended popup\. status: ended/i })).toBeInTheDocument()
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
    // Player must teleport near the NPC but not overlap its occupied hitbox.
    expect(gameState.player.x === 400 && gameState.player.y === 300).toBe(false)
    expect(
      hitboxesOverlap(
        { x: gameState.player.x, y: gameState.player.y },
        { x: 400, y: 300 },
      ),
    ).toBe(false)
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

  it('de-overlaps persisted NPCs that share the same stored position', () => {
    window.localStorage.setItem(
      NPC_POSITION_STORAGE_KEY,
      JSON.stringify({
        'overlap-a': { x: 777, y: 555 },
        'overlap-b': { x: 777, y: 555 },
      }),
    )
    ;(useActiveSessions as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        sessionId: 'overlap-a',
        provider: 'claude',
        workspacePath: '/test',
        startedAt: '2024-01-01T00:00:00Z',
        status: 'active',
        lastEventAt: '2024-01-01T00:01:00Z',
        pendingApprovals: 0,
      },
      {
        sessionId: 'overlap-b',
        provider: 'codex',
        workspacePath: '/test',
        startedAt: '2024-01-01T00:00:00Z',
        status: 'active',
        lastEventAt: '2024-01-01T00:01:00Z',
        pendingApprovals: 0,
      },
    ])

    render(<OfficePage />)

    const posA = gameState.npcs['overlap-a']
    const posB = gameState.npcs['overlap-b']
    expect(posA).toBeDefined()
    expect(posB).toBeDefined()
    if (!posA || !posB) return
    expect(hitboxesOverlap(posA, posB)).toBe(false)
  })

  it('de-overlaps already-seeded NPCs that are stacked in runtime state', () => {
    ;(useActiveSessions as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        sessionId: 'runtime-a',
        provider: 'claude',
        workspacePath: '/test',
        startedAt: '2024-01-01T00:00:00Z',
        status: 'active',
        lastEventAt: '2024-01-01T00:01:00Z',
        pendingApprovals: 0,
      },
      {
        sessionId: 'runtime-b',
        provider: 'codex',
        workspacePath: '/test',
        startedAt: '2024-01-01T00:00:00Z',
        status: 'active',
        lastEventAt: '2024-01-01T00:01:00Z',
        pendingApprovals: 0,
      },
    ])

    gameState.npcs['runtime-a'] = { x: 930, y: 640 }
    gameState.npcs['runtime-b'] = { x: 930, y: 640 }

    render(<OfficePage />)

    const posA = gameState.npcs['runtime-a']
    const posB = gameState.npcs['runtime-b']
    expect(posA).toBeDefined()
    expect(posB).toBeDefined()
    if (!posA || !posB) return
    expect(hitboxesOverlap(posA, posB)).toBe(false)
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

  it('nudges persisted player position to nearest free spot when initial spawn is blocked', async () => {
    const initial = { x: 1234, y: 567, direction: 'south' as const }
    window.localStorage.setItem(PLAYER_STATE_STORAGE_KEY, JSON.stringify(initial))

    const blockedX = initial.x + PLAYER_HITBOX.offsetX
    const blockedY = initial.y + PLAYER_HITBOX.offsetY
    const overlapsSpy = vi.spyOn(CollisionMap.prototype, 'overlaps').mockImplementation((x, y) => (
      x === blockedX && y === blockedY
    ))

    try {
      render(<OfficePage />)

      await waitFor(() => {
        expect(gameState.player.x === initial.x && gameState.player.y === initial.y).toBe(false)
      })
    } finally {
      overlapsSpy.mockRestore()
    }
  })

  it('passes pending-approval sessions into npc behavior step for center-attention routing', () => {
    const attentionSession = {
      sessionId: 'attention-session',
      provider: 'claude',
      workspacePath: '/test',
      startedAt: '2024-01-01T00:00:00Z',
      status: 'active',
      lastEventAt: '2024-01-01T00:01:00Z',
      pendingApprovals: 2,
    }
    ;(useActiveSessions as ReturnType<typeof vi.fn>).mockReturnValue([attentionSession])
    storeState.sessions = { 'attention-session': attentionSession }

    render(<OfficePage />)
    runEngineFrame(16)

    const latestCall = stepNpcBehaviorsMock.mock.calls.at(-1)?.[0]
    expect(latestCall).toBeDefined()
    if (!latestCall) return
    expect(latestCall.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionId: 'attention-session',
          pendingApprovals: 2,
        }),
      ]),
    )
  })

  it('pauses selected NPC movement while popup is open and resumes after close', () => {
    const session = {
      sessionId: 'pause-session',
      provider: 'claude',
      workspacePath: '/test',
      startedAt: '2024-01-01T00:00:00Z',
      status: 'active',
      lastEventAt: '2024-01-01T00:01:00Z',
      pendingApprovals: 0,
    }
    ;(useActiveSessions as ReturnType<typeof vi.fn>).mockReturnValue([session])
    storeState.sessions = { 'pause-session': session }

    const { rerender } = render(<OfficePage />)
    expect(gameState.npcs['pause-session']).toBeDefined()
    const initial = { ...(gameState.npcs['pause-session']!) }

    runEngineFrame(16)
    const moved = { ...gameState.npcs['pause-session'] }
    expect(moved.x).toBeGreaterThan(initial.x)

    storeState.selectedSessionId = 'pause-session'
    storeState.sessionDetailOpen = true
    act(() => {
      rerender(<OfficePage />)
    })
    runEngineFrame(16)
    const paused = { ...gameState.npcs['pause-session'] }
    expect(paused).toEqual(moved)

    storeState.sessionDetailOpen = false
    act(() => {
      rerender(<OfficePage />)
    })
    runEngineFrame(16)
    const resumed = { ...gameState.npcs['pause-session'] }
    expect(resumed.x).toBeGreaterThan(paused.x)
  })

  it('lets NPCs escape when persisted positions start inside collision overlap', () => {
    const session = {
      sessionId: 'stuck-session',
      provider: 'claude',
      workspacePath: '/test',
      startedAt: '2024-01-01T00:00:00Z',
      status: 'active',
      lastEventAt: '2024-01-01T00:01:00Z',
      pendingApprovals: 0,
    }
    ;(useActiveSessions as ReturnType<typeof vi.fn>).mockReturnValue([session])
    storeState.sessions = { 'stuck-session': session }

    const overlapsSpy = vi.spyOn(CollisionMap.prototype, 'overlaps').mockReturnValue(true)
    try {
      render(<OfficePage />)
      const initial = { ...(gameState.npcs['stuck-session']!) }

      runEngineFrame(16)

      const moved = gameState.npcs['stuck-session']
      expect(moved).toBeDefined()
      if (!moved) return
      expect(moved.x).toBeGreaterThan(initial.x)
    } finally {
      overlapsSpy.mockRestore()
    }
  })

  it('keeps player movement responsive when NPC collisions would deadlock movement', () => {
    render(<OfficePage />)
    gameState.player.x = 400
    gameState.player.y = 300
    gameState.npcs['blocker-session'] = { x: 433, y: 300 }
    const initialX = gameState.player.x

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', bubbles: true }))
    })
    runEngineFrame(16)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', bubbles: true }))
    })

    expect(gameState.player.x).toBeGreaterThan(initialX)
  })
})

describe('OfficePage scrollToSession', () => {
  beforeEach(() => {
    stubMapManifestFetch()
    Object.keys(gameState.npcs).forEach(k => delete gameState.npcs[k])
    gameState.player.x = 2 * 96
    gameState.player.y = 5 * 96
    gameState.tick = 0
    gameState.worldTimeMs = 0
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

  it('teleports player to a nearby free spot instead of overlapping the NPC', () => {
    render(<OfficePage />)
    gameState.npcs['test-session-1'] = { x: 400, y: 300 }

    act(() => {
      scrollToSession('test-session-1')
    })

    expect(gameState.player.x === 400 && gameState.player.y === 300).toBe(false)
    expect(
      hitboxesOverlap(
        { x: gameState.player.x, y: gameState.player.y },
        { x: 400, y: 300 },
      ),
    ).toBe(false)
    expect(
      spriteRectsOverlap(
        { x: gameState.player.x, y: gameState.player.y },
        { x: 400, y: 300 },
      ),
    ).toBe(false)
  })

  it('selects the nearest available spot when closer adjacent spots are occupied', () => {
    render(<OfficePage />)
    gameState.npcs['test-session-1'] = { x: 400, y: 300 }
    // Block nearest north/west/east candidates (32px away), leaving south as closest free.
    gameState.npcs['block-north'] = { x: 400, y: 268 }
    gameState.npcs['block-west'] = { x: 368, y: 300 }
    gameState.npcs['block-east'] = { x: 432, y: 300 }

    act(() => {
      scrollToSession('test-session-1')
    })

    expect(gameState.player.x).toBe(400)
    expect(gameState.player.y).toBe(364)
    expect(
      hitboxesOverlap(
        { x: gameState.player.x, y: gameState.player.y },
        { x: 400, y: 300 },
      ),
    ).toBe(false)
    expect(
      spriteRectsOverlap(
        { x: gameState.player.x, y: gameState.player.y },
        { x: 400, y: 300 },
      ),
    ).toBe(false)
  })

  it('avoids teleporting into map obstacles when selecting a nearby spot', () => {
    const overlapsSpy = vi.spyOn(CollisionMap.prototype, 'overlaps').mockImplementation((x, y, w, h) => (
      x === 416 && y === 300 && w === PLAYER_HITBOX.w && h === PLAYER_HITBOX.h
    ))
    try {
      render(<OfficePage />)
      gameState.npcs['test-session-1'] = { x: 400, y: 300 }

      act(() => {
        scrollToSession('test-session-1')
      })

      expect(overlapsSpy).toHaveBeenCalled()
      expect(gameState.player.x).toBe(400)
      expect(gameState.player.y).toBe(236)
      expect(
        hitboxesOverlap(
          { x: gameState.player.x, y: gameState.player.y },
          { x: 400, y: 300 },
        ),
      ).toBe(false)
      expect(
        spriteRectsOverlap(
          { x: gameState.player.x, y: gameState.player.y },
          { x: 400, y: 300 },
        ),
      ).toBe(false)
    } finally {
      overlapsSpy.mockRestore()
    }
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
