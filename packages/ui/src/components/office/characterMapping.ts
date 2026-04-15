export const CHARACTER_TYPES = [
  'astronaut',
  'robot',
  'alien',
  'hologram',
  'monkey',
  'caveman',
  'ghost',
  'ninja',
  'pirate',
  'medicine-woman',
] as const

export type CharacterType = typeof CHARACTER_TYPES[number]

/**
 * Returns a new shuffled bag containing all character types.
 * Used by the shuffle-bag system to ensure every character appears once
 * before any character is repeated.
 */
export function newCharacterBag(): CharacterType[] {
  const bag = [...CHARACTER_TYPES] as CharacterType[]
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j]!, bag[i]!]
  }
  return bag
}

/**
 * Draws one character from the bag. When the bag is exhausted, a fresh
 * shuffled bag is generated automatically.
 * Returns [picked character, remaining bag].
 */
export function drawFromBag(bag: CharacterType[]): [CharacterType, CharacterType[]] {
  const refill = bag.length === 0 ? newCharacterBag() : bag
  const [character, ...rest] = refill
  return [character!, rest]
}

export function characterFaceUrl(character: CharacterType): string {
  return `/sprites/faces/${character}-face.png`
}
