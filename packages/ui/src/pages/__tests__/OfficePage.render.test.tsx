/**
 * OfficePage render quality tests (separate file to avoid GameEngine mock conflict).
 *
 * Test A: canvas element has imageRendering: 'pixelated' in its inline style.
 *
 * Note: Tests B+C (imageSmoothingEnabled toggling in the render loop) are covered
 * by the AgentSprite.test.ts extension which uses a plain mock ctx object.
 * The full OfficePage render loop cannot be exercised here without a real Canvas 2D
 * context (jsdom stubs do not track property assignments reliably).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

// --- Mocks (must be declared before dynamic imports) ---

vi.mock('../../game/GameEngine.js', () => ({
  GameEngine: class MockGameEngine {
    constructor(_canvas: HTMLCanvasElement) {}
    start() {}
    stop() {}
    update(_deltaMs: number) {}
    render() {}
  },
}))

vi.mock('../../store/index.js', () => {
  const storeState = {
    events: {},
    sessions: {},
    historySessions: {},
    pendingApprovalsBySession: {},
    popupWindows: {},
    popupWindowOrder: [],
    wsStatus: 'disconnected',
    selectedSessionId: null,
    selectedPlayerCharacter: 'astronaut',
    sessionDetailOpen: false,
    selectSession: vi.fn(),
    setHistoryMode: vi.fn(),
    setPopupPreferredTab: vi.fn(),
    setSessionDetailOpen: vi.fn(),
    closeSessionPopup: vi.fn(),
    minimizeSessionPopup: vi.fn(),
    restoreSessionPopup: vi.fn(),
    bringSessionPopupToFront: vi.fn(),
    setSessionPopupRect: vi.fn(),
    clearSessionPopupPreferredTab: vi.fn(),
  }
  const useStore = vi.fn((selector: (s: typeof storeState) => unknown) => selector(storeState))
  ;(useStore as unknown as { getState: () => typeof storeState }).getState = () => storeState
  return { useStore }
})

vi.mock('../../store/selectors.js', () => ({
  useActiveSessions: vi.fn(() => []),
}))

vi.mock('../../components/office/InstancePopupHub.js', () => ({
  InstancePopupHub: () => null,
}))

vi.mock('../../components/office/AgentSprite.js', () => ({
  drawAgentSprite: vi.fn(),
}))

const mockCtx = {
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  imageSmoothingEnabled: true,
}

class MockResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

import { OfficePage } from '../OfficePage.js'

describe('OfficePage render quality', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => mockCtx,
    ) as unknown as typeof HTMLCanvasElement.prototype.getContext
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('Test A: canvas element has imageRendering: pixelated in inline style', () => {
    act(() => { render(<OfficePage />) })
    const canvas = screen.getByTestId('game-canvas') as HTMLCanvasElement
    // imageRendering should be 'pixelated' — will be RED before OfficePage.tsx is patched
    expect(canvas.style.imageRendering).toBe('pixelated')
  })
})
