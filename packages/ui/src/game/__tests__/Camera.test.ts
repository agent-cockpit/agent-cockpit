import { describe, it, expect } from 'vitest'
import { updateCamera, LERP_FACTOR } from '../Camera.js'
import type { CameraState, WorldBounds } from '../Camera.js'

const DEFAULT_BOUNDS: WorldBounds = { minX: 0, minY: 0, maxX: 1920, maxY: 1440 }

function makeCam(overrides: Partial<CameraState> = {}): CameraState {
  return {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    viewportW: 800,
    viewportH: 600,
    zoom: 1,
    ...overrides,
  }
}

describe('updateCamera', () => {
  it('moves cam.x toward targetX by LERP_FACTOR fraction each call', () => {
    const cam = makeCam({ x: 0, targetX: 100 })
    updateCamera(cam, DEFAULT_BOUNDS, 16)
    expect(cam.x).toBeCloseTo(100 * LERP_FACTOR)
  })

  it('converges cam.x to within 1px of targetX after 100 calls', () => {
    const cam = makeCam({ x: 0, targetX: 500 })
    for (let i = 0; i < 100; i++) {
      updateCamera(cam, DEFAULT_BOUNDS, 16)
    }
    expect(Math.abs(cam.x - 500)).toBeLessThan(1)
  })

  it('clamps cam.x to bounds.minX when target is far left', () => {
    const cam = makeCam({ x: 0, targetX: -9999 })
    updateCamera(cam, DEFAULT_BOUNDS, 16)
    expect(cam.x).toBeGreaterThanOrEqual(DEFAULT_BOUNDS.minX)
  })

  it('clamps cam.x to bounds.maxX - viewportW when target is far right', () => {
    const cam = makeCam({ x: 0, targetX: 99999 })
    updateCamera(cam, DEFAULT_BOUNDS, 16)
    expect(cam.x).toBeLessThanOrEqual(DEFAULT_BOUNDS.maxX - cam.viewportW)
  })

  it('clamps cam.y to bounds.minY when target is far up', () => {
    const cam = makeCam({ y: 0, targetY: -9999 })
    updateCamera(cam, DEFAULT_BOUNDS, 16)
    expect(cam.y).toBeGreaterThanOrEqual(DEFAULT_BOUNDS.minY)
  })

  it('clamps cam.y to bounds.maxY - viewportH when target is far down', () => {
    const cam = makeCam({ y: 0, targetY: 99999 })
    updateCamera(cam, DEFAULT_BOUNDS, 16)
    expect(cam.y).toBeLessThanOrEqual(DEFAULT_BOUNDS.maxY - cam.viewportH)
  })

  it('sanitizes non-finite camera values so state remains usable', () => {
    const cam = makeCam({
      x: Number.NaN,
      y: Number.NaN,
      targetX: Number.NaN,
      targetY: Number.POSITIVE_INFINITY,
      viewportW: Number.NaN,
      viewportH: Number.NaN,
    })

    updateCamera(cam, DEFAULT_BOUNDS, 16)

    expect(Number.isFinite(cam.x)).toBe(true)
    expect(Number.isFinite(cam.y)).toBe(true)
    expect(cam.x).toBeGreaterThanOrEqual(DEFAULT_BOUNDS.minX)
    expect(cam.y).toBeGreaterThanOrEqual(DEFAULT_BOUNDS.minY)
  })
})
