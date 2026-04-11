// TilemapRenderer.ts
// Pre-renders the full 3232×3232 tilemap to OffscreenCanvas once at load.
// Each frame: call blit(ctx, camX, camY) inside ctx.scale(2,2) block.

const TILE_SIZE = 32
const TILE_ORIGIN_X = -46  // from map.json mapConfig.boundingBox.minX
const TILE_ORIGIN_Y = -43  // from map.json mapConfig.boundingBox.minY
const WORLD_PX = 3232
const WORLD_PY = 3232
const FALLBACK_COLOR = '#9ca3af'  // gray fill for missing tileset PNGs

// --- Pure utility functions (exported for testing) ---

export function tileToPixel(tx: number, ty: number): { px: number; py: number } {
  return {
    px: (tx - TILE_ORIGIN_X) * TILE_SIZE,
    py: (ty - TILE_ORIGIN_Y) * TILE_SIZE,
  }
}

// Wang 4-bit bitmask: north=bit0, east=bit1, south=bit2, west=bit3
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
  private offscreen: OffscreenCanvas | null = null
  private _ready = false

  get ready(): boolean { return this._ready }

  async load(): Promise<void> {
    // 1. Fetch all JSON assets in parallel
    const [mapData, terrainMapData, transitionMapData, objManifestData] = await Promise.all([
      fetch('/map/map.json').then(r => r.json()),
      fetch('/map/terrain-map.json').then(r => r.json()),
      fetch('/map/transition-map.json').then(r => r.json()),
      fetch('/map/objects/manifest.json').then(r => r.json()),
    ])

    // 2. Build tileset image map: tilesetId → HTMLImageElement (or null if missing)
    const tilesetImgMap = new Map<string, HTMLImageElement | null>()
    for (const ts of mapData.tilesets) {
      try {
        const img = await loadImage(`/map/tilesets/${ts.filename}`)
        tilesetImgMap.set(ts.id, img)
      } catch {
        console.warn(`[TilemapRenderer] Missing tileset PNG: ${ts.filename} — using fallback color`)
        tilesetImgMap.set(ts.id, null)
      }
    }

    // 3. Build object image map: objectId → HTMLImageElement (or null if missing)
    const objImgMap = new Map<string, HTMLImageElement | null>()
    for (const obj of objManifestData.objects) {
      if (!obj.visible) continue
      try {
        const img = await loadImage(`/map/objects/${obj.filename}`)
        objImgMap.set(obj.id, img)
      } catch {
        console.warn(`[TilemapRenderer] Missing object PNG: ${obj.filename}`)
        objImgMap.set(obj.id, null)
      }
    }

    // 4. Load overlay PNG
    let overlayImg: HTMLImageElement | null = null
    const overlay = mapData.overlays?.[0]
    if (overlay) {
      try {
        overlayImg = await loadImage(`/map/overlays/${overlay.filename}`)
      } catch {
        console.warn(`[TilemapRenderer] Missing overlay PNG: ${overlay.filename}`)
      }
    }

    // 5. Build transition lookup: "x,y" → edge bitmask + tilesetId
    // For cells with transitions, we need both the tilesetId and the Wang index.
    // Use the first edge's tilesetId as the "primary" tileset for this cell.
    // Wang index is derived from which edges are present.
    type TransitionEntry = { tilesetId: string; wangIndex: number }
    const transitionLookup = new Map<string, TransitionEntry>()
    for (const t of transitionMapData.transitions) {
      const { north, east, south, west } = t.edges
      const wangIndex = wangIndexFromEdges({
        north: !!north,
        east: !!east,
        south: !!south,
        west: !!west,
      })
      // Determine tilesetId: pick the first present edge's tilesetId
      const tilesetId = (north ?? east ?? south ?? west)?.tilesetId
      if (tilesetId) {
        transitionLookup.set(`${t.x},${t.y}`, { tilesetId, wangIndex })
      }
    }

    // 6. Build terrain lookup: terrainId → terrain.color (for fallback fills)
    const terrainColorMap = new Map<number, string>()
    for (const terrain of mapData.terrains) {
      terrainColorMap.set(terrain.id, terrain.color ?? FALLBACK_COLOR)
    }

    // 7. Create OffscreenCanvas and render all layers
    this.offscreen = new OffscreenCanvas(WORLD_PX, WORLD_PY)
    const octx = this.offscreen.getContext('2d')!

    // Layer A: Base terrain tiles
    for (const cell of terrainMapData.cells) {
      if (cell.terrainId === 0) continue  // skip empty/no-terrain cells
      const { px, py } = tileToPixel(cell.x, cell.y)
      const transKey = `${cell.x},${cell.y}`
      const trans = transitionLookup.get(transKey)

      if (trans) {
        // Has transitions — draw Wang tile
        const tilesetImg = tilesetImgMap.get(trans.tilesetId) ?? null
        if (tilesetImg) {
          drawWangTile(octx, tilesetImg, trans.wangIndex, px, py)
        } else {
          // Fallback: solid color from terrain
          octx.fillStyle = terrainColorMap.get(cell.terrainId) ?? FALLBACK_COLOR
          octx.fillRect(px, py, TILE_SIZE, TILE_SIZE)
        }
      } else {
        // Pure terrain cell (no edges) — use Wang index 0 (full lower terrain tile)
        // Find a tileset where lowerTerrainId matches cell.terrainId
        const matchingTileset = mapData.tilesets.find(
          (ts: { lowerTerrainId: number }) => ts.lowerTerrainId === cell.terrainId
        )
        const tilesetImg = matchingTileset ? (tilesetImgMap.get(matchingTileset.id) ?? null) : null
        if (tilesetImg) {
          drawWangTile(octx, tilesetImg, 0, px, py)
        } else {
          // Solid color fallback
          octx.fillStyle = terrainColorMap.get(cell.terrainId) ?? FALLBACK_COLOR
          octx.fillRect(px, py, TILE_SIZE, TILE_SIZE)
        }
      }
    }

    // Layer B: Overlay PNG (world pixel coords from map.json overlays[])
    if (overlayImg && overlay) {
      octx.drawImage(
        overlayImg,
        overlay.worldCoordinates.x,
        overlay.worldCoordinates.y,
        overlay.dimensions.width,
        overlay.dimensions.height,
      )
    }

    // Layer C: Objects sorted by layer ascending
    const sortedObjects = [...objManifestData.objects]
      .filter((o: { visible: boolean }) => o.visible)
      .sort((a: { layer: number }, b: { layer: number }) => a.layer - b.layer)
    for (const obj of sortedObjects) {
      const img = objImgMap.get(obj.id)
      if (!img) continue
      const { x, y, width, height } = obj.boundingBox
      // boundingBox is already in pixel world-space (no tile offset needed)
      octx.drawImage(img, x, y, width, height)
    }

    this._ready = true
  }

  blit(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    if (!this._ready || !this.offscreen) return
    // Called inside ctx.scale(zoom, zoom) block — coordinates are world-space
    ctx.drawImage(this.offscreen as unknown as HTMLCanvasElement, -camX, -camY)
  }
}

// --- Internal helper (not exported) ---
function drawWangTile(
  ctx: OffscreenCanvasRenderingContext2D,
  tilesetImg: HTMLImageElement,
  wangIndex: number,
  destX: number,
  destY: number,
): void {
  const srcCol = wangIndex % 4
  const srcRow = Math.floor(wangIndex / 4)
  ctx.drawImage(
    tilesetImg,
    srcCol * TILE_SIZE, srcRow * TILE_SIZE, TILE_SIZE, TILE_SIZE,
    destX, destY, TILE_SIZE, TILE_SIZE,
  )
}
