import { describe, it, expect } from 'vitest'
// These imports will fail until Plan 02 creates TilemapRenderer.ts
// That is intentional — Wave 0 stubs are in RED state
import { tileToPixel, wangIndexFromEdges } from '../TilemapRenderer.js'
import { TilemapRenderer } from '../TilemapRenderer.js'

describe('tileToPixel', () => {
  it('maps tile origin (-46,-43) to pixel (0,0)', () => {
    expect(tileToPixel(-46, -43)).toEqual({ px: 0, py: 0 })
  })
  it('maps tile (0,0) to pixel (1472,1376)', () => {
    expect(tileToPixel(0, 0)).toEqual({ px: 1472, py: 1376 })
  })
  it('maps tile (54,57) to pixel (3200,3200)', () => {
    expect(tileToPixel(54, 57)).toEqual({ px: 3200, py: 3200 })
  })
})

describe('wangIndexFromEdges', () => {
  it('returns 0 when no edges present', () => {
    expect(wangIndexFromEdges({})).toBe(0)
  })
  it('sets bit 0 (north) when north edge present', () => {
    expect(wangIndexFromEdges({ north: true })).toBe(1)
  })
  it('sets bit 1 (east) when east edge present', () => {
    expect(wangIndexFromEdges({ east: true })).toBe(2)
  })
  it('sets bit 2 (south) when south edge present', () => {
    expect(wangIndexFromEdges({ south: true })).toBe(4)
  })
  it('sets bit 3 (west) when west edge present', () => {
    expect(wangIndexFromEdges({ west: true })).toBe(8)
  })
  it('returns 15 when all edges present', () => {
    expect(wangIndexFromEdges({ north: true, east: true, south: true, west: true })).toBe(15)
  })
})

describe('TilemapRenderer', () => {
  it('ready is false before load() is called', () => {
    const renderer = new TilemapRenderer()
    expect(renderer.ready).toBe(false)
  })
})
