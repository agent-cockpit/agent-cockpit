import { describe, it, expect } from 'vitest'
import { STATE_ROW_OFFSET, type AnimationState } from '../spriteStates.js'

describe('spriteStates — walk extension', () => {
  it('STATE_ROW_OFFSET.walk equals 32', () => {
    expect(STATE_ROW_OFFSET.walk).toBe(32)
  })

  it('existing offsets are unchanged', () => {
    expect(STATE_ROW_OFFSET.idle).toBe(0)
    expect(STATE_ROW_OFFSET.blocked).toBe(8)
    expect(STATE_ROW_OFFSET.completed).toBe(16)
    expect(STATE_ROW_OFFSET.failed).toBe(24)
  })

  it('STATE_ROW_OFFSET has exactly 5 keys', () => {
    expect(Object.keys(STATE_ROW_OFFSET)).toHaveLength(5)
  })

  it('AnimationState includes walk (compile-time check)', () => {
    // If 'walk' is not in the AnimationState union, TypeScript will error here
    const state: AnimationState = 'walk'
    expect(state).toBe('walk')
  })
})
