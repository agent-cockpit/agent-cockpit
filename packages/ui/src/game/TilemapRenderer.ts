// TilemapRenderer.ts
// Loads map composites from a static maps-manifest and blits every map at its
// world-space origin. Each frame: call blit(ctx, camX, camY) inside
// ctx.scale(zoom, zoom) block.

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

export interface MapManifestEntry {
  id: string
  dir: string
  worldOriginX: number
  worldOriginY: number
  widthPx: number
  heightPx: number
  tileOriginX: number
  tileOriginY: number
}

export interface MapsManifest {
  version: string
  maps: MapManifestEntry[]
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load: ${src}`))
    img.src = src
  })
}

export class TilemapRenderer {
  private maps: Array<{ img: HTMLImageElement; entry: MapManifestEntry }> = []
  private _ready = false

  get ready(): boolean { return this._ready }

  worldW = 0
  worldH = 0

  async load(manifestUrl = '/maps/maps-manifest.json'): Promise<void> {
    const manifest: MapsManifest = await fetch(manifestUrl).then(r => r.json())
    this.maps = await Promise.all(
      manifest.maps.map(entry =>
        loadImage(`${entry.dir}/map-composite.png`).then(img => ({ img, entry })),
      ),
    )
    this.worldW = Math.max(0, ...this.maps.map(m => m.entry.worldOriginX + m.entry.widthPx))
    this.worldH = Math.max(0, ...this.maps.map(m => m.entry.worldOriginY + m.entry.heightPx))
    this._ready = true
  }

  blit(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    if (!this._ready) return
    for (const { img, entry } of this.maps) {
      ctx.drawImage(img, entry.worldOriginX - camX, entry.worldOriginY - camY)
    }
  }

  /** Render all map composites scaled to fit a target rect. Used for minimap pre-rendering. */
  blitMinimap(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    targetX: number,
    targetY: number,
    targetW: number,
    targetH: number,
  ): void {
    if (!this._ready || this.worldW === 0 || this.worldH === 0) return
    const scaleX = targetW / this.worldW
    const scaleY = targetH / this.worldH
    for (const { img, entry } of this.maps) {
      ctx.drawImage(
        img,
        targetX + entry.worldOriginX * scaleX,
        targetY + entry.worldOriginY * scaleY,
        entry.widthPx * scaleX,
        entry.heightPx * scaleY,
      )
    }
  }
}
