import sharp from 'sharp'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { CHARACTER_TYPES } from '../packages/ui/src/components/office/characterMapping.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'packages', 'ui', 'public', 'sprites', 'faces')

async function copyFaces(): Promise<void> {
  await fs.mkdir(OUT, { recursive: true })

  for (const character of CHARACTER_TYPES) {
    const faceDir = path.join(ROOT, 'assets', 'raw', character, 'face')
    const entries = await fs.readdir(faceDir)
    const pngs = entries.filter((e) => e.toLowerCase().endsWith('.png'))

    if (pngs.length === 0) {
      throw new Error(`No face PNG found for ${character}`)
    }

    const srcPath = path.join(faceDir, pngs[0])
    const destPath = path.join(OUT, `${character}-face.png`)

    await sharp(srcPath)
      .resize(64, 64, { fit: 'cover' })
      .png()
      .toFile(destPath)

    console.log(`Copied ${character}-face.png`)
  }
}

copyFaces()
  .then(() => {
    console.log('Done: all face PNGs copied.')
  })
  .catch((err) => {
    console.error('Error copying faces:', err)
    process.exit(1)
  })
