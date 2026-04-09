import sharp from 'sharp'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const FRAME_SIZE = 64
const DIRECTIONS = [
  'south',
  'north',
  'east',
  'west',
  'south-east',
  'south-west',
  'north-east',
  'north-west',
] as const

const ANIM_STATES = ['idle', 'blocked', 'completed', 'failed'] as const

type Direction = (typeof DIRECTIONS)[number]
type AnimState = (typeof ANIM_STATES)[number]

/**
 * Downloads a PNG from url and saves cropped 64×64 version to dest.
 * If the source is larger than 64×64, it fits within 64×64 with contain (letterbox).
 */
export async function downloadAndCrop(url: string, dest: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())

  await fs.mkdir(path.dirname(dest), { recursive: true })

  await sharp(buffer)
    .resize(FRAME_SIZE, FRAME_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(dest)
}

/**
 * Builds a single row buffer of maxFrames × FRAME_SIZE wide, FRAME_SIZE tall.
 * Pads shorter rows by repeating the last frame.
 */
async function buildRow(framePaths: string[], maxFrames: number): Promise<Buffer> {
  const width = maxFrames * FRAME_SIZE
  const height = FRAME_SIZE

  // Create transparent base
  const base = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer()

  const compositeInputs: sharp.OverlayOptions[] = []

  for (let i = 0; i < maxFrames; i++) {
    // Use the frame if available, otherwise repeat the last frame
    const framePath = framePaths[Math.min(i, framePaths.length - 1)]
    // Resize frame to FRAME_SIZE×FRAME_SIZE before compositing
    const resized = await sharp(framePath)
      .resize(FRAME_SIZE, FRAME_SIZE, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer()
    compositeInputs.push({
      input: resized,
      top: 0,
      left: i * FRAME_SIZE,
    })
  }

  return sharp(base).composite(compositeInputs).png().toBuffer()
}

/**
 * Assembles the full sprite sheet for a character and writes it to public/sprites/.
 * Also writes the manifest JSON file.
 */
export async function buildSheet(character: string): Promise<void> {
  const rawDir = path.join(ROOT, 'assets', 'raw', character)
  const outputDir = path.join(ROOT, 'packages', 'ui', 'public', 'sprites')

  await fs.mkdir(outputDir, { recursive: true })

  // Determine frame counts per state
  const frameCounts: Record<AnimState, number> = {
    idle: 0,
    blocked: 0,
    completed: 0,
    failed: 0,
  }

  // Load all frame paths
  const framesByStateDir: Record<string, string[]> = {}

  for (const state of ANIM_STATES) {
    let maxFramesForState = 0

    for (const dir of DIRECTIONS) {
      const frameDir = path.join(rawDir, state, dir)
      let frames: string[] = []

      try {
        const entries = await fs.readdir(frameDir)
        frames = entries
          .filter((f) => f.startsWith('frame-') && f.endsWith('.png'))
          .sort((a, b) => {
            const numA = parseInt(a.replace('frame-', '').replace('.png', ''))
            const numB = parseInt(b.replace('frame-', '').replace('.png', ''))
            return numA - numB
          })
          .map((f) => path.join(frameDir, f))
      } catch {
        console.warn(`Warning: No frames found at ${frameDir}`)
      }

      framesByStateDir[`${state}/${dir}`] = frames
      if (frames.length > maxFramesForState) {
        maxFramesForState = frames.length
      }
    }

    frameCounts[state] = maxFramesForState
  }

  // Compute global maxFrames across all states (columns in sheet)
  const maxFrames = Math.max(...Object.values(frameCounts), 1)

  // Build all rows: 4 states × 8 directions = 32 rows
  const rowBuffers: Buffer[] = []

  for (const state of ANIM_STATES) {
    for (const dir of DIRECTIONS) {
      const frames = framesByStateDir[`${state}/${dir}`] ?? []
      const rowBuffer = await buildRow(frames, maxFrames)
      rowBuffers.push(rowBuffer)
    }
  }

  // Stack all rows vertically
  const totalWidth = maxFrames * FRAME_SIZE
  const totalHeight = rowBuffers.length * FRAME_SIZE

  const sheetBase = await sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer()

  const sheetComposite: sharp.OverlayOptions[] = rowBuffers.map((buf, rowIndex) => ({
    input: buf,
    top: rowIndex * FRAME_SIZE,
    left: 0,
  }))

  const sheetPath = path.join(outputDir, `${character}-sheet.png`)
  await sharp(sheetBase).composite(sheetComposite).png().toFile(sheetPath)

  console.log(`Wrote ${sheetPath} (${totalWidth}×${totalHeight}px)`)

  // Write manifest JSON
  const manifest = {
    states: frameCounts,
    frameSize: FRAME_SIZE,
    directions: DIRECTIONS.length,
  }

  const manifestPath = path.join(outputDir, `${character}-manifest.json`)
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
  console.log(`Wrote ${manifestPath}`)
}

// CLI entry point
const character = process.argv[2]
if (character) {
  buildSheet(character)
    .then(() => {
      console.log(`Done: ${character} sprite sheet assembled.`)
    })
    .catch((err) => {
      console.error('Error building sprite sheet:', err)
      process.exit(1)
    })
}
