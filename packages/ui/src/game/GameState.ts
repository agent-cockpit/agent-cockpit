export let WORLD_W = 3232  // 101×32 = 3232px — Cockpit Map-export world width
export let WORLD_H = 3232  // 101×32 = 3232px — Cockpit Map-export world height
// Updated after tilemapRenderer.load() resolves — see OfficePage.tsx.

export function setWorldBounds(w: number, h: number): void {
  WORLD_W = w
  WORLD_H = h
}

import type { CameraState } from './Camera.js'

export interface GameState {
  camera: CameraState
  player: { x: number; y: number; direction: string; animTime: number }
  npcs: Record<string, { x: number; y: number }>
  tick: number
}

export const gameState: GameState = {
  camera: { x: 0, y: 0, targetX: 0, targetY: 0, viewportW: 0, viewportH: 0, zoom: 2 },
  player: { x: 2080, y: 1920, direction: 'south', animTime: 0 },  // map tile (19,17) → pixel (65*32, 60*32) — open floor
  npcs: {},
  tick: 0,
}
