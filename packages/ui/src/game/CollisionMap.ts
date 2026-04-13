export interface Rect { x: number; y: number; w: number; h: number }

export const PLAYER_HITBOX = { offsetX: 16, offsetY: 32, w: 32, h: 32 }

const TILE_SIZE = 32
const TILE_ORIGIN_X = -46  // from map.json mapConfig.boundingBox.minX
const TILE_ORIGIN_Y = -43  // from map.json mapConfig.boundingBox.minY

// Objects in manifest.json use coordinates relative to the map content canvas origin.
// The canvas starts at the first wall row: tile (1, 2) → world px (1504, 1440).
const OBJECT_ORIGIN_X = (1 - TILE_ORIGIN_X) * TILE_SIZE   // 1504
const OBJECT_ORIGIN_Y = (2 - TILE_ORIGIN_Y) * TILE_SIZE   // 1440
const OBJECT_RENDER_ANCHOR_Y_PX = 32

// Terrain IDs that block movement
const SOLID_TERRAIN_IDS = new Set([2, 3])  // void exterior + interior wall

interface TerrainCell { x: number; y: number; terrainId: number }
interface TerrainMapData { defaultTerrain: number; cells: TerrainCell[] }
interface ObjectEntry {
  boundingBox: { x: number; y: number; width: number; height: number }
  description: string
  visible: boolean
  filename?: string
}
export interface ObjectAlphaBounds { x: number; y: number; w: number; h: number }

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

  loadObjects(
    objects: ObjectEntry[],
    alphaBoundsByFilename: Record<string, ObjectAlphaBounds> = {},
  ): void {
    this.solidObjects = []
    for (const obj of objects) {
      if (!obj.visible) continue
      if (obj.description.startsWith('Character:')) continue  // ambient sprites, not obstacles
      const { x, y, width, height } = obj.boundingBox
      const alpha = obj.filename ? alphaBoundsByFilename[obj.filename] : undefined
      const relX = x + (alpha?.x ?? 0)
      // Exported object bboxes are content-canvas bounds, while map-composite places
      // sprites with a raised visual anchor (consistent +32px on Y in this map export).
      // Shift colliders up to match the actual render placement.
      const renderAnchorYOffset = obj.filename ? OBJECT_RENDER_ANCHOR_Y_PX : 0
      const relY = y + (alpha?.y ?? 0) - renderAnchorYOffset
      const relW = alpha?.w ?? width
      const relH = alpha?.h ?? height
      if (relW <= 0 || relH <= 0) continue
      this.solidObjects.push({
        x: relX + OBJECT_ORIGIN_X,
        y: relY + OBJECT_ORIGIN_Y,
        w: relW,
        h: relH,
      })
    }
  }

  // Debug: draw all solid object rects on a canvas context (world space, caller applies cam offset)
  debugDraw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,0,0,0.8)'
    ctx.lineWidth = 1
    for (const obj of this.solidObjects) {
      ctx.strokeRect(obj.x - camX, obj.y - camY, obj.w, obj.h)
    }
    ctx.strokeStyle = 'rgba(0,255,0,0.4)'
    for (const key of this.solidTiles) {
      const [tx, ty] = key.split(',').map(Number)
      ctx.strokeRect(tx * TILE_SIZE - camX, ty * TILE_SIZE - camY, TILE_SIZE, TILE_SIZE)
    }
    ctx.restore()
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
