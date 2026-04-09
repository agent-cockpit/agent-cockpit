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

export function sessionToCharacter(sessionId: string): CharacterType {
  const index = parseInt(sessionId.slice(-4), 16) % CHARACTER_TYPES.length
  return CHARACTER_TYPES[index]
}
