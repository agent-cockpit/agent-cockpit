export interface Rect { x: number; y: number; w: number; h: number }

export const PLAYER_HITBOX = { offsetX: 16, offsetY: 32, w: 32, h: 32 }

const TILE_SIZE = 32
const TILE_ORIGIN_X = -46  // from map.json mapConfig.boundingBox.minX
const TILE_ORIGIN_Y = -43  // from map.json mapConfig.boundingBox.minY

// Terrain IDs that block movement
const SOLID_TERRAIN_IDS = new Set([2, 3])  // void exterior + interior wall

interface TerrainCell { x: number; y: number; terrainId: number }
interface TerrainMapData { defaultTerrain: number; cells: TerrainCell[] }
interface ObjectEntry {
  boundingBox: { x: number; y: number; width: number; height: number }
  description: string
  visible: boolean
}

export class CollisionMap {
  private solidTiles = new Set<string>()
  private solidObjects: Rect[] = []

  loadTerrain(data: TerrainMapData): void {
    this.solidTiles.clear()
    for (const cell of data.cells) {
      if (SOLID_TERRAIN_IDS.has(cell.terrainId)) {
        const px = (cell.x - TILE_ORIGIN_X) * TILE_SIZE
        const py = (cell.y - TILE_ORIGIN_Y) * TILE_SIZE
        // Key by tile index (not pixel) — each tile covers 32x32px
        const tx = Math.floor(px / TILE_SIZE)
        const ty = Math.floor(py / TILE_SIZE)
        this.solidTiles.add(`${tx},${ty}`)
      }
    }
  }

  loadObjects(objects: ObjectEntry[]): void {
    this.solidObjects = []
    for (const obj of objects) {
      if (!obj.visible) continue
      if (obj.description.startsWith('Character:')) continue  // ambient sprites, not obstacles
      const { x, y, width, height } = obj.boundingBox
      this.solidObjects.push({ x, y, w: width, h: height })
    }
  }

  // Returns true if the given AABB overlaps any solid tile or solid object
  overlaps(x: number, y: number, w: number, h: number): boolean {
    // Check tiles: test all 4 corners of the AABB
    const corners = [
      { cx: x,         cy: y         },
      { cx: x + w - 1, cy: y         },
      { cx: x,         cy: y + h - 1 },
      { cx: x + w - 1, cy: y + h - 1 },
    ]
    for (const { cx, cy } of corners) {
      const tx = Math.floor(cx / TILE_SIZE)
      const ty = Math.floor(cy / TILE_SIZE)
      if (this.solidTiles.has(`${tx},${ty}`)) return true
    }
    // Check objects (AABB vs AABB)
    for (const obj of this.solidObjects) {
      if (x < obj.x + obj.w && x + w > obj.x &&
          y < obj.y + obj.h && y + h > obj.y) {
        return true
      }
    }
    return false
  }
}
