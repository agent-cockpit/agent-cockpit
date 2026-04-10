// AgentSprite is now a canvas draw utility (not a React component).
// Tests verify the drawAgentSprite function correctly calls ctx.drawImage
// and uses imageCache for sprite sheets.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { drawAgentSprite } from '../components/office/AgentSprite.js'
import type { SessionRecord } from '../store/index.js'

// sessionId ending in '0000' → parseInt('0000',16)=0 → 0%10=0 → 'astronaut'
const mockSession: SessionRecord = {
  sessionId: 'sess-0000',
  provider: 'claude',
  workspacePath: '/home/user/my-repo',
  startedAt: '2024-01-01T00:00:00Z',
  status: 'active',
  lastEventAt: '2024-01-01T00:01:00Z',
  pendingApprovals: 0,
}

function makeMockCtx() {
  return {
    drawImage: vi.fn(),
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D
}

describe('drawAgentSprite', () => {
  let imageCache: Map<string, HTMLImageElement>

  beforeEach(() => {
    imageCache = new Map()
    vi.clearAllMocks()
  })

  it('caches and reuses the image by src', () => {
    const ctx = makeMockCtx()
    const position = { x: 10, y: 20 }

    // First call — image created and cached but not complete → no drawImage call
    drawAgentSprite({ ctx, session: mockSession, lastEvent: undefined, position, imageCache })
    expect(imageCache.size).toBe(1)

    // Simulate image loaded
    const img = imageCache.get([...imageCache.keys()][0])!
    Object.defineProperty(img, 'complete', { value: true, configurable: true })

    // Second call — same imageCache, image complete now
    drawAgentSprite({ ctx, session: mockSession, lastEvent: undefined, position, imageCache })
    expect((ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  it('uses astronaut sheet for sess-0000', () => {
    const ctx = makeMockCtx()
    const position = { x: 0, y: 0 }

    drawAgentSprite({ ctx, session: mockSession, lastEvent: undefined, position, imageCache })
    const key = [...imageCache.keys()][0]
    expect(key).toContain('astronaut-sheet.png')
  })

  it('draws at the given position when image is complete', () => {
    const ctx = makeMockCtx()
    const position = { x: 50, y: 100 }

    drawAgentSprite({ ctx, session: mockSession, lastEvent: undefined, position, imageCache })
    const img = imageCache.get([...imageCache.keys()][0])!
    Object.defineProperty(img, 'complete', { value: true, configurable: true })

    drawAgentSprite({ ctx, session: mockSession, lastEvent: undefined, position, imageCache })
    const drawImageCalls = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls
    expect(drawImageCalls.length).toBe(1)
    // Args: img, sx, sy, sw, sh, dx, dy, dw, dh
    expect(drawImageCalls[0][5]).toBe(50)  // dx
    expect(drawImageCalls[0][6]).toBe(100) // dy
    expect(drawImageCalls[0][7]).toBe(64)  // dw
    expect(drawImageCalls[0][8]).toBe(64)  // dh
  })

  it('draws at column 0 (static blit, frame 0 only)', () => {
    const ctx = makeMockCtx()
    const position = { x: 0, y: 0 }

    drawAgentSprite({ ctx, session: mockSession, lastEvent: undefined, position, imageCache })
    const img = imageCache.get([...imageCache.keys()][0])!
    Object.defineProperty(img, 'complete', { value: true, configurable: true })

    drawAgentSprite({ ctx, session: mockSession, lastEvent: undefined, position, imageCache })
    const drawImageCalls = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls
    expect(drawImageCalls[0][1]).toBe(0)  // sx = col * 64 = 0
  })

  it('defaults direction to south (row 0 for idle state)', () => {
    const ctx = makeMockCtx()
    const position = { x: 0, y: 0 }

    // active session with no events → 'waiting' agentState → 'idle' animState → row offset 0
    // direction 'south' → DIRECTION_ROWS.south = 0 → total row = 0
    drawAgentSprite({ ctx, session: mockSession, lastEvent: undefined, position, imageCache })
    const img = imageCache.get([...imageCache.keys()][0])!
    Object.defineProperty(img, 'complete', { value: true, configurable: true })

    drawAgentSprite({ ctx, session: mockSession, lastEvent: undefined, position, imageCache })
    const drawImageCalls = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls
    expect(drawImageCalls[0][2]).toBe(0)  // sy = row * 64 = 0
  })

  it('skips drawing if image is not complete', () => {
    const ctx = makeMockCtx()
    const position = { x: 0, y: 0 }

    drawAgentSprite({ ctx, session: mockSession, lastEvent: undefined, position, imageCache })
    // Image not complete (default)
    expect((ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
  })
})
