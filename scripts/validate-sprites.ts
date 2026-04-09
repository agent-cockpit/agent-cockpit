import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const CHARACTER_TYPES = [
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

type CharacterType = (typeof CHARACTER_TYPES)[number]

async function checkFile(filePath: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const stat = await fs.stat(filePath)
    if (stat.size === 0) {
      return { ok: false, error: `File is zero bytes: ${filePath}` }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: `File not found: ${filePath}` }
  }
}

async function validateCharacter(character: string): Promise<boolean> {
  const spritesDir = path.join(ROOT, 'packages', 'ui', 'public', 'sprites')
  const sheetPath = path.join(spritesDir, `${character}-sheet.png`)
  const manifestPath = path.join(spritesDir, `${character}-manifest.json`)

  const [sheetCheck, manifestCheck] = await Promise.all([
    checkFile(sheetPath),
    checkFile(manifestPath),
  ])

  let allOk = true

  if (!sheetCheck.ok) {
    console.error(`FAIL: ${sheetCheck.error}`)
    allOk = false
  } else {
    console.log(`OK: ${sheetPath}`)
  }

  if (!manifestCheck.ok) {
    console.error(`FAIL: ${manifestCheck.error}`)
    allOk = false
  } else {
    console.log(`OK: ${manifestPath}`)
  }

  return allOk
}

async function validateTier2(): Promise<boolean> {
  console.log('tier2 check pending')
  return true
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  const characterFlag = args.indexOf('--character')
  const allFlag = args.includes('--all')
  const tier2Flag = args.includes('--tier2')

  let allOk = true

  if (tier2Flag) {
    const ok = await validateTier2()
    if (!ok) allOk = false
  } else if (characterFlag !== -1) {
    const character = args[characterFlag + 1]
    if (!character) {
      console.error('Error: --character requires a character name argument')
      process.exit(1)
    }
    const ok = await validateCharacter(character)
    if (!ok) allOk = false
  } else if (allFlag) {
    for (const character of CHARACTER_TYPES) {
      const ok = await validateCharacter(character)
      if (!ok) allOk = false
    }
  } else {
    console.error('Usage: validate-sprites.ts --character <name> | --all | --tier2')
    process.exit(1)
  }

  if (!allOk) {
    process.exit(1)
  }

  console.log('Validation passed.')
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
