// TilemapRenderer.ts
// Loads the pre-rendered map-composite.png (3232×3232) and blits the visible
// viewport slice each frame. map-composite.png is the authoritative render from
// the Cockpit Map-export — terrain + overlay + objects all pre-composited.
// Each frame: call blit(ctx, camX, camY) inside ctx.scale(zoom, zoom) block.

const WORLD_PX = 3232
const WORLD_PY = 3232

// --- Pure utility functions (exported for testing) ---

// tileToPixel: converts tile-space coordinates to pixel-space.
// Tile origin offset: minX=-46, minY=-43 (from map.json mapConfig.boundingBox)
export function tileToPixel(tx: number, ty: number): { px: number; py: number } {
  const TILE_SIZE = 32
  const TILE_ORIGIN_X = -46
  const TILE_ORIGIN_Y = -43
  return {
    px: (tx - TILE_ORIGIN_X) * TILE_SIZE,
    py: (ty - TILE_ORIGIN_Y) * TILE_SIZE,
  }
}

// wangIndexFromEdges: 4-bit bitmask N=bit0, E=bit1, S=bit2, W=bit3
export function wangIndexFromEdges(edges: {
  north?: boolean
  east?: boolean
  south?: boolean
  west?: boolean
}): number {
  let idx = 0
  if (edges.north) idx |= 1
  if (edges.east)  idx |= 2
  if (edges.south) idx |= 4
  if (edges.west)  idx |= 8
  return idx
}

// --- Image load helper ---
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load: ${src}`))
    img.src = src
  })
}

// --- TilemapRenderer class ---
export class TilemapRenderer {
  private mapImg: HTMLImageElement | null = null
  private _ready = false

  get ready(): boolean { return this._ready }

  // worldW/worldH exposed for bounds checks in tests
  readonly worldW = WORLD_PX
  readonly worldH = WORLD_PY

  async load(): Promise<void> {
    // Load the pre-rendered composite — all terrain, transitions, overlay, and
    // objects are already composited into this single 3232×3232 image.
    this.mapImg = await loadImage('/map/map-composite.png')
    this._ready = true
  }

  blit(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    if (!this._ready || !this.mapImg) return
    // Called inside ctx.scale(zoom, zoom) block — camX/camY are world-space coords.
    ctx.drawImage(this.mapImg, -camX, -camY)
  }
}
