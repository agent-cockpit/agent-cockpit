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

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

export function updateCamera(
  cam: CameraState,
  bounds: WorldBounds,
  _deltaMs: number,
): void {
  const viewportW = Number.isFinite(cam.viewportW) && cam.viewportW > 0 ? cam.viewportW : 0
  const viewportH = Number.isFinite(cam.viewportH) && cam.viewportH > 0 ? cam.viewportH : 0
  const maxCamX = Math.max(bounds.minX, bounds.maxX - viewportW)
  const maxCamY = Math.max(bounds.minY, bounds.maxY - viewportH)

  const currentX = finiteOr(cam.x, bounds.minX)
  const currentY = finiteOr(cam.y, bounds.minY)
  const targetX = finiteOr(cam.targetX, currentX)
  const targetY = finiteOr(cam.targetY, currentY)

  const nextX = finiteOr(currentX + (targetX - currentX) * LERP_FACTOR, currentX)
  const nextY = finiteOr(currentY + (targetY - currentY) * LERP_FACTOR, currentY)

  cam.x = Math.max(bounds.minX, Math.min(nextX, maxCamX))
  cam.y = Math.max(bounds.minY, Math.min(nextY, maxCamY))
}
