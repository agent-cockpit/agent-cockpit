import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { TilemapRenderer, type MapManifestEntry } from '../TilemapRenderer.js'

class InstantImage {
  onload: ((this: GlobalEventHandlers, ev: Event) => unknown) | null = null
  onerror: ((this: GlobalEventHandlers, ev: Event | string) => unknown) | null = null
  private _src = ''

  set src(value: string) {
    this._src = value
    queueMicrotask(() => this.onload?.call(this as unknown as GlobalEventHandlers, new Event('load')))
  }

  get src(): string {
    return this._src
  }
}

describe('TilemapRenderer multi-map', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', InstantImage)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('load() with 2-entry manifest stores 2 loaded maps', async () => {
    const manifest: { version: string; maps: MapManifestEntry[] } = {
      version: '1',
      maps: [
        {
          id: 'map-a',
          dir: '/map-a',
          worldOriginX: 0,
          worldOriginY: 0,
          widthPx: 3232,
          heightPx: 3232,
          tileOriginX: -46,
          tileOriginY: -43,
        },
        {
          id: 'map-b',
          dir: '/map-b',
          worldOriginX: 3232,
          worldOriginY: 0,
          widthPx: 1000,
          heightPx: 1000,
          tileOriginX: 0,
          tileOriginY: 0,
        },
      ],
    }

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => manifest,
    }))

    const renderer = new TilemapRenderer()
    await renderer.load('/maps/maps-manifest.json')

    const internalMaps = (renderer as unknown as { maps?: unknown[] }).maps ?? []
    expect(internalMaps).toHaveLength(2)
  })

  it('worldW equals max worldOriginX + widthPx across all maps', async () => {
    const manifest = {
      version: '1',
      maps: [
        {
          id: 'map-a',
          dir: '/map-a',
          worldOriginX: 0,
          worldOriginY: 0,
          widthPx: 3232,
          heightPx: 3232,
          tileOriginX: -46,
          tileOriginY: -43,
        },
        {
          id: 'map-b',
          dir: '/map-b',
          worldOriginX: 3232,
          worldOriginY: 0,
          widthPx: 1000,
          heightPx: 1000,
          tileOriginX: 0,
          tileOriginY: 0,
        },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => manifest }))

    const renderer = new TilemapRenderer()
    await renderer.load('/maps/maps-manifest.json')
    expect(renderer.worldW).toBe(4232)
  })

  it('worldH equals max worldOriginY + heightPx across all maps', async () => {
    const manifest = {
      version: '1',
      maps: [
        {
          id: 'map-a',
          dir: '/map-a',
          worldOriginX: 0,
          worldOriginY: 0,
          widthPx: 3232,
          heightPx: 3232,
          tileOriginX: -46,
          tileOriginY: -43,
        },
        {
          id: 'map-b',
          dir: '/map-b',
          worldOriginX: 3232,
          worldOriginY: 0,
          widthPx: 1000,
          heightPx: 1000,
          tileOriginX: 0,
          tileOriginY: 0,
        },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => manifest }))

    const renderer = new TilemapRenderer()
    await renderer.load('/maps/maps-manifest.json')
    expect(renderer.worldH).toBe(3232)
  })

  it('blit() calls ctx.drawImage for each map at correct offset', () => {
    const renderer = new TilemapRenderer() as unknown as {
      _ready: boolean
      maps: Array<{ img: HTMLImageElement; entry: MapManifestEntry }>
      blit: (ctx: CanvasRenderingContext2D, camX: number, camY: number) => void
    }
    renderer._ready = true
    renderer.maps = [
      {
        img: {} as HTMLImageElement,
        entry: {
          id: 'map-a',
          dir: '/map-a',
          worldOriginX: 0,
          worldOriginY: 0,
          widthPx: 3232,
          heightPx: 3232,
          tileOriginX: -46,
          tileOriginY: -43,
        },
      },
      {
        img: {} as HTMLImageElement,
        entry: {
          id: 'map-b',
          dir: '/map-b',
          worldOriginX: 3200,
          worldOriginY: 100,
          widthPx: 1000,
          heightPx: 1000,
          tileOriginX: 0,
          tileOriginY: 0,
        },
      },
    ]
    const drawImage = vi.fn()
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D

    renderer.blit(ctx, 200, 50)

    expect(drawImage).toHaveBeenCalledTimes(2)
    expect(drawImage).toHaveBeenNthCalledWith(1, renderer.maps[0].img, -200, -50)
    expect(drawImage).toHaveBeenNthCalledWith(2, renderer.maps[1].img, 3000, 50)
  })

  it('ready is false before load()', () => {
    const renderer = new TilemapRenderer()
    expect(renderer.ready).toBe(false)
  })
})
