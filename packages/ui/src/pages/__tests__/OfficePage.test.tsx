import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

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

// Mock useStore and useActiveSessions to return minimal data
vi.mock('../../store/index.js', () => ({
  useStore: vi.fn((selector: (s: object) => unknown) => {
    const state = {
      events: {},
      sessions: {},
      selectedSessionId: null,
      selectSession: vi.fn(),
      setHistoryMode: vi.fn(),
    }
    return selector(state)
  }),
}))

vi.mock('../../store/selectors.js', () => ({
  useActiveSessions: vi.fn(() => []),
}))

// Mock useLocalStorage
vi.mock('../../hooks/useLocalStorage.js', () => ({
  useLocalStorage: vi.fn(() => [{}, vi.fn()]),
}))

// Mock ResizeObserver in jsdom
class MockResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

// Mock InstancePopupHub
vi.mock('../../components/office/InstancePopupHub.js', () => ({
  InstancePopupHub: () => null,
}))

import { OfficePage } from '../OfficePage.js'

describe('OfficePage canvas mount', () => {
  beforeEach(() => {
    startMock.mockClear()
    stopMock.mockClear()
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
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
})
