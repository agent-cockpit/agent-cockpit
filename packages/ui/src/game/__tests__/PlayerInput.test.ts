import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PLAYER_SPEED, WALK_FRAME_DURATION_MS, WALK_FRAME_COUNT, attachInput, detachInput, getKeysDown, movePlayer } from '../PlayerInput.js'
import { WORLD_W, WORLD_H } from '../GameState.js'

// Helper to make a player object
function makePlayer(x = 0, y = 0, direction = 'south', animTime = 0) {
  return { x, y, direction, animTime }
}

// Helper to make a keys Set
function keys(...codes: string[]): ReadonlySet<string> {
  return new Set(codes)
}

// Use a safe starting position far from all world bounds
const SAFE_X = 500
const SAFE_Y = 500

describe('movePlayer — basic movement', () => {
  it('W held: x unchanged, y decreases by PLAYER_SPEED * dt', () => {
    const player = makePlayer(SAFE_X, SAFE_Y)
    movePlayer(player, keys('KeyW'), 1000)
    expect(player.x).toBe(SAFE_X)
    expect(player.y).toBeCloseTo(SAFE_Y - PLAYER_SPEED)
  })

  it('S held: x unchanged, y increases by PLAYER_SPEED * dt', () => {
    const player = makePlayer(SAFE_X, SAFE_Y)
    movePlayer(player, keys('KeyS'), 1000)
    expect(player.x).toBe(SAFE_X)
    expect(player.y).toBeCloseTo(SAFE_Y + PLAYER_SPEED)
  })

  it('D held: x increases by PLAYER_SPEED * dt, y unchanged', () => {
    const player = makePlayer(SAFE_X, SAFE_Y)
    movePlayer(player, keys('KeyD'), 1000)
    expect(player.x).toBeCloseTo(SAFE_X + PLAYER_SPEED)
    expect(player.y).toBe(SAFE_Y)
  })

  it('A held: x decreases by PLAYER_SPEED * dt, y unchanged', () => {
    const player = makePlayer(SAFE_X, SAFE_Y)
    movePlayer(player, keys('KeyA'), 1000)
    expect(player.x).toBeCloseTo(SAFE_X - PLAYER_SPEED)
    expect(player.y).toBe(SAFE_Y)
  })

  it('ArrowUp held: same as W', () => {
    const player = makePlayer(SAFE_X, SAFE_Y)
    movePlayer(player, keys('ArrowUp'), 1000)
    expect(player.y).toBeCloseTo(SAFE_Y - PLAYER_SPEED)
  })

  it('ArrowDown held: same as S', () => {
    const player = makePlayer(SAFE_X, SAFE_Y)
    movePlayer(player, keys('ArrowDown'), 1000)
    expect(player.y).toBeCloseTo(SAFE_Y + PLAYER_SPEED)
  })

  it('ArrowLeft held: same as A', () => {
    const player = makePlayer(SAFE_X, SAFE_Y)
    movePlayer(player, keys('ArrowLeft'), 1000)
    expect(player.x).toBeCloseTo(SAFE_X - PLAYER_SPEED)
  })

  it('ArrowRight held: same as D', () => {
    const player = makePlayer(SAFE_X, SAFE_Y)
    movePlayer(player, keys('ArrowRight'), 1000)
    expect(player.x).toBeCloseTo(SAFE_X + PLAYER_SPEED)
  })
})

describe('movePlayer — diagonal normalisation', () => {
  it('W+D held: total displacement equals PLAYER_SPEED * dt (not * sqrt(2))', () => {
    const player = makePlayer(SAFE_X, SAFE_Y)
    const dt = 1 // 1000ms -> 1 second
    movePlayer(player, keys('KeyW', 'KeyD'), 1000)
    const dx = player.x - SAFE_X
    const dy = player.y - SAFE_Y
    const displacement = Math.sqrt(dx * dx + dy * dy)
    expect(displacement).toBeCloseTo(PLAYER_SPEED * dt, 1)
  })

  it('W+A held: total displacement equals PLAYER_SPEED * dt', () => {
    const player = makePlayer(SAFE_X, SAFE_Y)
    movePlayer(player, keys('KeyW', 'KeyA'), 1000)
    const dx = player.x - SAFE_X
    const dy = player.y - SAFE_Y
    const displacement = Math.sqrt(dx * dx + dy * dy)
    expect(displacement).toBeCloseTo(PLAYER_SPEED, 1)
  })

  it('S+D held: total displacement equals PLAYER_SPEED * dt', () => {
    const player = makePlayer(SAFE_X, SAFE_Y)
    movePlayer(player, keys('KeyS', 'KeyD'), 1000)
    const dx = player.x - SAFE_X
    const dy = player.y - SAFE_Y
    const displacement = Math.sqrt(dx * dx + dy * dy)
    expect(displacement).toBeCloseTo(PLAYER_SPEED, 1)
  })
})

describe('movePlayer — world bounds clamping', () => {
  it('does not move player below x=0 (left bound)', () => {
    const player = makePlayer(0, 100)
    movePlayer(player, keys('KeyA'), 1000)
    expect(player.x).toBe(0)
  })

  it('does not move player beyond WORLD_W - 64 (right bound)', () => {
    const player = makePlayer(WORLD_W - 64, 100)
    movePlayer(player, keys('KeyD'), 1000)
    expect(player.x).toBe(WORLD_W - 64)
  })

  it('does not move player below y=0 (top bound)', () => {
    const player = makePlayer(100, 0)
    movePlayer(player, keys('KeyW'), 1000)
    expect(player.y).toBe(0)
  })

  it('does not move player beyond WORLD_H - 64 (bottom bound)', () => {
    const player = makePlayer(100, WORLD_H - 64)
    movePlayer(player, keys('KeyS'), 1000)
    expect(player.y).toBe(WORLD_H - 64)
  })
})

describe('movePlayer — direction tracking', () => {
  it('D held sets direction to "east"', () => {
    const player = makePlayer(100, 100, 'south')
    movePlayer(player, keys('KeyD'), 100)
    expect(player.direction).toBe('east')
  })

  it('A held sets direction to "west"', () => {
    const player = makePlayer(100, 100, 'south')
    movePlayer(player, keys('KeyA'), 100)
    expect(player.direction).toBe('west')
  })

  it('W held sets direction to "north"', () => {
    const player = makePlayer(100, 100, 'south')
    movePlayer(player, keys('KeyW'), 100)
    expect(player.direction).toBe('north')
  })

  it('S held sets direction to "south"', () => {
    const player = makePlayer(100, 100, 'north')
    movePlayer(player, keys('KeyS'), 100)
    expect(player.direction).toBe('south')
  })

  it('W+D held sets direction to "north-east"', () => {
    const player = makePlayer(100, 100, 'south')
    movePlayer(player, keys('KeyW', 'KeyD'), 100)
    expect(player.direction).toBe('north-east')
  })

  it('W+A held sets direction to "north-west"', () => {
    const player = makePlayer(100, 100, 'south')
    movePlayer(player, keys('KeyW', 'KeyA'), 100)
    expect(player.direction).toBe('north-west')
  })

  it('S+D held sets direction to "south-east"', () => {
    const player = makePlayer(100, 100, 'north')
    movePlayer(player, keys('KeyS', 'KeyD'), 100)
    expect(player.direction).toBe('south-east')
  })

  it('S+A held sets direction to "south-west"', () => {
    const player = makePlayer(100, 100, 'north')
    movePlayer(player, keys('KeyS', 'KeyA'), 100)
    expect(player.direction).toBe('south-west')
  })

  it('no keys held does NOT change player.direction', () => {
    const player = makePlayer(100, 100, 'north-east')
    movePlayer(player, keys(), 100)
    expect(player.direction).toBe('north-east')
  })
})

describe('input guards — focused element', () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
  })

  afterEach(() => {
    detachInput()
    vi.restoreAllMocks()
  })

  it('onKeyDown is a no-op when activeElement is HTMLInputElement', () => {
    // Mock document.activeElement to return an input
    const inputEl = document.createElement('input')
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(inputEl)

    attachInput()
    const keysDown = getKeysDown()

    // Fire a keydown event for 'KeyW'
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }))

    expect(keysDown.has('KeyW')).toBe(false)
  })

  it('onKeyDown is a no-op when activeElement is HTMLTextAreaElement', () => {
    const textareaEl = document.createElement('textarea')
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(textareaEl)

    attachInput()
    const keysDown = getKeysDown()

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', bubbles: true }))

    expect(keysDown.has('KeyA')).toBe(false)
  })

  it('onKeyDown is a no-op when activeElement is HTMLSelectElement', () => {
    const selectEl = document.createElement('select')
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(selectEl)

    attachInput()
    const keysDown = getKeysDown()

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', bubbles: true }))

    expect(keysDown.has('KeyS')).toBe(false)
  })

  it('onKeyDown adds to keysDown when activeElement is the body', () => {
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body)

    attachInput()
    const keysDown = getKeysDown()

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', bubbles: true }))

    expect(keysDown.has('KeyD')).toBe(true)
  })
})

describe('attachInput / detachInput lifecycle', () => {
  afterEach(() => {
    detachInput()
    vi.restoreAllMocks()
  })

  it('attachInput adds keydown and keyup listeners to window', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    attachInput()
    const codes = addSpy.mock.calls.map(([event]) => event)
    expect(codes).toContain('keydown')
    expect(codes).toContain('keyup')
  })

  it('detachInput removes keydown and keyup listeners from window', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    attachInput()
    detachInput()
    const codes = removeSpy.mock.calls.map(([event]) => event)
    expect(codes).toContain('keydown')
    expect(codes).toContain('keyup')
  })

  it('detachInput clears the keysDown Set', () => {
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body)
    attachInput()
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }))
    expect(getKeysDown().has('KeyW')).toBe(true)
    detachInput()
    expect(getKeysDown().size).toBe(0)
  })

  it('attachInput is idempotent — double-attach does not double-register listeners', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    attachInput()
    const countAfterFirst = addSpy.mock.calls.length
    attachInput()
    const countAfterSecond = addSpy.mock.calls.length
    expect(countAfterSecond).toBe(countAfterFirst)
  })
})

describe('movePlayer — animTime', () => {
  it('animTime advances by deltaMs when a key is held', () => {
    const player = makePlayer(SAFE_X, SAFE_Y)
    movePlayer(player, keys('KeyW'), 200)
    expect(player.animTime).toBe(200)
  })

  it('animTime accumulates across multiple frames when moving', () => {
    const player = makePlayer(SAFE_X, SAFE_Y)
    movePlayer(player, keys('KeyW'), 150)
    movePlayer(player, keys('KeyW'), 150)
    expect(player.animTime).toBe(300)
  })

  it('animTime resets to 0 when no keys are held', () => {
    const player = makePlayer(SAFE_X, SAFE_Y, 'south', 999)
    movePlayer(player, keys(), 16)
    expect(player.animTime).toBe(0)
  })

  it('col formula wraps from frame 3 back to frame 0', () => {
    // At animTime = WALK_FRAME_DURATION_MS * WALK_FRAME_COUNT, col should be 0 again
    const cycleMs = WALK_FRAME_DURATION_MS * WALK_FRAME_COUNT
    const col = Math.floor(cycleMs / WALK_FRAME_DURATION_MS) % WALK_FRAME_COUNT
    expect(col).toBe(0)
    // Frame 3 is at (WALK_FRAME_COUNT - 1) * WALK_FRAME_DURATION_MS
    const frame3 = Math.floor((WALK_FRAME_DURATION_MS * 3) / WALK_FRAME_DURATION_MS) % WALK_FRAME_COUNT
    expect(frame3).toBe(3)
  })

  it('animTime stays 0 when opposing keys W+S cancel out (no moonwalk)', () => {
    const player = makePlayer(SAFE_X, SAFE_Y)
    movePlayer(player, keys('KeyW', 'KeyS'), 200)
    expect(player.animTime).toBe(0)
  })

  it('animTime stays 0 when opposing keys A+D cancel out (no moonwalk)', () => {
    const player = makePlayer(SAFE_X, SAFE_Y)
    movePlayer(player, keys('KeyA', 'KeyD'), 200)
    expect(player.animTime).toBe(0)
  })

  it('WALK_FRAME_DURATION_MS is 100ms (natural humanoid gait, 10fps walk cycle)', () => {
    expect(WALK_FRAME_DURATION_MS).toBe(100)
  })

  it('full 8-frame walk cycle completes in 800ms', () => {
    const cycleMs = WALK_FRAME_DURATION_MS * WALK_FRAME_COUNT
    expect(cycleMs).toBe(800)
  })
})
