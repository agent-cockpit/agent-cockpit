import { describe, it, expect } from 'vitest'
import { CHARACTER_TYPES, newCharacterBag, drawFromBag } from '../components/office/characterMapping.js'

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

describe('newCharacterBag', () => {
  it('returns all 10 character types', () => {
    const bag = newCharacterBag()
    expect(bag).toHaveLength(CHARACTER_TYPES.length)
    expect([...bag].sort()).toEqual([...CHARACTER_TYPES].sort())
  })

  it('produces different orderings across calls (probabilistic)', () => {
    const results = new Set<string>()
    for (let i = 0; i < 20; i++) {
      results.add(newCharacterBag().join(','))
    }
    // With 10! possible shuffles, getting the same order twice in 20 tries is astronomically unlikely
    expect(results.size).toBeGreaterThan(1)
  })
})

describe('drawFromBag', () => {
  it('draws a valid character and shrinks the bag', () => {
    const bag = newCharacterBag()
    const [char, rest] = drawFromBag(bag)
    expect(CHARACTER_TYPES).toContain(char)
    expect(rest).toHaveLength(bag.length - 1)
  })

  it('refills when bag is empty', () => {
    const [char, rest] = drawFromBag([])
    expect(CHARACTER_TYPES).toContain(char)
    expect(rest).toHaveLength(CHARACTER_TYPES.length - 1)
  })

  it('all 10 characters are drawn before any repeat', () => {
    let bag = newCharacterBag()
    const drawn: string[] = []
    for (let i = 0; i < CHARACTER_TYPES.length; i++) {
      const [char, next] = drawFromBag(bag)
      drawn.push(char)
      bag = next
    }
    expect(new Set(drawn).size).toBe(CHARACTER_TYPES.length)
  })
})
