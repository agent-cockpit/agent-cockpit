export interface CameraState {
  x: number
  y: number
  targetX: number
  targetY: number
  viewportW: number
  viewportH: number
  zoom: number          // fixed at 2 for Phase 16.1; applied in render, not camera math
}

export interface WorldBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export const LERP_FACTOR = 0.1

export function updateCamera(
  cam: CameraState,
  bounds: WorldBounds,
  _deltaMs: number,
): void {
  cam.x += (cam.targetX - cam.x) * LERP_FACTOR
  cam.y += (cam.targetY - cam.y) * LERP_FACTOR
  cam.x = Math.max(bounds.minX, Math.min(cam.x, bounds.maxX - cam.viewportW))
  cam.y = Math.max(bounds.minY, Math.min(cam.y, bounds.maxY - cam.viewportH))
}
