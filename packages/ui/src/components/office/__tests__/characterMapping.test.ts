import { describe, it, expect } from 'vitest'
import { CHARACTER_TYPES, characterFaceUrl } from '../characterMapping'

describe('characterFaceUrl', () => {
  it('returns correct URL for astronaut', () => {
    expect(characterFaceUrl('astronaut')).toBe('/sprites/faces/astronaut-face.png')
  })

  it('returns correct URL for medicine-woman', () => {
    expect(characterFaceUrl('medicine-woman')).toBe('/sprites/faces/medicine-woman-face.png')
  })

  it.each(CHARACTER_TYPES)('returns valid URL for %s', (character) => {
    const url = characterFaceUrl(character)
    expect(url).toMatch(/^\/sprites\/faces\/.+-face\.png$/)
  })

  it.each(CHARACTER_TYPES)('URL for %s matches expected pattern', (character) => {
    expect(characterFaceUrl(character)).toBe(`/sprites/faces/${character}-face.png`)
  })
})
