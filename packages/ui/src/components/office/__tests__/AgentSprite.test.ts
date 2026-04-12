import { describe, it, expect } from 'vitest'

// Mirror the constants from AgentSprite.tsx (after Task 2 adds them)
const NPC_TICKS_PER_FRAME = 8
const NPC_FRAME_COUNTS = { idle: 4, blocked: 8, completed: 9, failed: 7 } as const
type AnimationState = keyof typeof NPC_FRAME_COUNTS

function npcCol(tick: number, animState: AnimationState): number {
  return Math.floor(tick / NPC_TICKS_PER_FRAME) % NPC_FRAME_COUNTS[animState]
}

describe('NPC tick-based col computation', () => {
  it('col is 0 at tick=0 for all states', () => {
    expect(npcCol(0, 'idle')).toBe(0)
    expect(npcCol(0, 'blocked')).toBe(0)
    expect(npcCol(0, 'completed')).toBe(0)
    expect(npcCol(0, 'failed')).toBe(0)
  })

  it('col advances to 1 after NPC_TICKS_PER_FRAME ticks', () => {
    expect(npcCol(8, 'idle')).toBe(1)
    expect(npcCol(8, 'blocked')).toBe(1)
  })

  it('idle (4 frames): col wraps to 0 at tick=32', () => {
    expect(npcCol(32, 'idle')).toBe(0)
    expect(npcCol(24, 'idle')).toBe(3)  // last frame before wrap
  })

  it('blocked (8 frames): col wraps to 0 at tick=64', () => {
    expect(npcCol(64, 'blocked')).toBe(0)
    expect(npcCol(56, 'blocked')).toBe(7)
  })

  it('completed (9 frames): col wraps to 0 at tick=72', () => {
    expect(npcCol(72, 'completed')).toBe(0)
    expect(npcCol(64, 'completed')).toBe(8)
  })

  it('failed (7 frames): col wraps to 0 at tick=56', () => {
    expect(npcCol(56, 'failed')).toBe(0)
    expect(npcCol(48, 'failed')).toBe(6)
  })
})
