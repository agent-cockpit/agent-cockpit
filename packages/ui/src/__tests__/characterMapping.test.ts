import { describe, it, expect } from 'vitest'
import { CHARACTER_TYPES, sessionToCharacter } from '../components/office/characterMapping.js'

describe('CHARACTER_TYPES', () => {
  it('has exactly 10 entries', () => {
    expect(CHARACTER_TYPES).toHaveLength(10)
  })

  it('starts with astronaut', () => {
    expect(CHARACTER_TYPES[0]).toBe('astronaut')
  })

  it('ends with medicine-woman', () => {
    expect(CHARACTER_TYPES[9]).toBe('medicine-woman')
  })
})

describe('sessionToCharacter', () => {
  it("returns 'astronaut' for sessionId ending in '0000' (0 % 10 = 0)", () => {
    expect(sessionToCharacter('0000')).toBe('astronaut')
  })

  it("returns 'robot' for sessionId ending in '0001' (1 % 10 = 1)", () => {
    expect(sessionToCharacter('0001')).toBe('robot')
  })

  it("returns 'medicine-woman' for sessionId ending in '0009' (9 % 10 = 9)", () => {
    expect(sessionToCharacter('0009')).toBe('medicine-woman')
  })

  it("returns 'caveman' for sessionId ending in '000f' (15 % 10 = 5 → caveman)", () => {
    // CHARACTER_TYPES[5] = 'caveman': astronaut(0) robot(1) alien(2) hologram(3) monkey(4) caveman(5)
    expect(sessionToCharacter('000f')).toBe('caveman')
  })

  it("returns 'astronaut' for sessionId ending in '000a' (10 % 10 = 0)", () => {
    expect(sessionToCharacter('000a')).toBe('astronaut')
  })

  it('is stable: same input always returns same output', () => {
    const id = 'some-session-id-abc1'
    const first = sessionToCharacter(id)
    const second = sessionToCharacter(id)
    expect(first).toBe(second)
  })

  it('works with longer session IDs (uses last 4 hex chars)', () => {
    // 'sess-' + 'feed' — parseInt('feed', 16) = 65261, 65261 % 10 = 1 → 'robot'
    expect(sessionToCharacter('sess-feed')).toBe('robot')
  })
})
