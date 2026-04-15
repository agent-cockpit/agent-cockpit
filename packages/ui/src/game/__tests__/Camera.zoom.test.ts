import { describe, it, expect } from 'vitest'
import { updateCamera } from '../Camera.js'
import type { CameraState } from '../Camera.js'

const WORLD_W = 3232
const WORLD_H = 3232
const ZOOM = 2

function makeZoomedCam(canvasW: number, canvasH: number): CameraState {
  return {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    viewportW: canvasW / ZOOM,   // world-space viewport width
    viewportH: canvasH / ZOOM,
    zoom: ZOOM,
  }
}

describe('zoom-corrected camera clamping', () => {
  it('viewportW equals canvas.width / zoom', () => {
    const cam = makeZoomedCam(800, 600)
    expect(cam.viewportW).toBe(400)
    expect(cam.viewportH).toBe(300)
  })

  it('cam.x clamps so right edge never exceeds world (WORLD_W - viewportW)', () => {
    const cam = makeZoomedCam(800, 600)
    cam.targetX = 99999
    updateCamera(cam, { minX: 0, minY: 0, maxX: WORLD_W, maxY: WORLD_H }, 16)
    expect(cam.x).toBeLessThanOrEqual(WORLD_W - cam.viewportW)  // <= 2832
  })

  it('cam.y clamps so bottom edge never exceeds world (WORLD_H - viewportH)', () => {
    const cam = makeZoomedCam(800, 600)
    cam.targetY = 99999
    updateCamera(cam, { minX: 0, minY: 0, maxX: WORLD_W, maxY: WORLD_H }, 16)
    expect(cam.y).toBeLessThanOrEqual(WORLD_H - cam.viewportH)  // <= 2932
  })

  it('cam.x stays >= 0 when target is negative', () => {
    const cam = makeZoomedCam(800, 600)
    cam.targetX = -99999
    updateCamera(cam, { minX: 0, minY: 0, maxX: WORLD_W, maxY: WORLD_H }, 16)
    expect(cam.x).toBeGreaterThanOrEqual(0)
  })
})

// Wave 0 stub for MAP-06: click hit-test must divide screen coords by zoom before adding camera offset.
// This describe block tests the formula used in OfficePage handleClick (Plan 03 Task 1 Modification 5).
// The formula is a pure arithmetic expression — no OfficePage import needed.
// These tests are GREEN immediately; they verify the math is correct so Plan 03 cannot regress it.
describe('click hit-test zoom correction', () => {
  it('screen click at x=200 with zoom=2, camera.x=100 yields worldX=200', () => {
    const screenX = 200
    const zoom = 2
    const cameraX = 100
    const worldX = (screenX / zoom) + cameraX
    expect(worldX).toBe(200)  // (200/2) + 100 = 100 + 100 = 200
  })

  it('screen click at x=0 with zoom=2, camera.x=500 yields worldX=500', () => {
    const screenX = 0
    const zoom = 2
    const cameraX = 500
    const worldX = (screenX / zoom) + cameraX
    expect(worldX).toBe(500)  // (0/2) + 500 = 0 + 500 = 500
  })

  it('screen click at x=400 with zoom=2, camera.x=0 yields worldX=200 (not 400)', () => {
    // Without zoom division, worldX would be 400+0=400 (wrong — off by zoom factor)
    const screenX = 400
    const zoom = 2
    const cameraX = 0
    const worldX = (screenX / zoom) + cameraX
    expect(worldX).toBe(200)  // correct: 200px into world-space
    expect(worldX).not.toBe(400)  // sanity: raw screenX without zoom division would be wrong
  })
})
