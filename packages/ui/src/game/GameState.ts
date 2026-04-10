export const WORLD_W = 96 * 20  // 1920px — tunable as map design matures
export const WORLD_H = 96 * 15  // 1440px — tunable as map design matures

import type { CameraState } from './Camera.js'

export interface GameState {
  camera: CameraState
  player: { x: number; y: number; direction: string }
  npcs: Record<string, { x: number; y: number }>
  tick: number
}

export const gameState: GameState = {
  camera: { x: 0, y: 0, targetX: 0, targetY: 0, viewportW: 0, viewportH: 0 },
  player: { x: 2 * 96, y: 5 * 96, direction: 'south' },
  npcs: {},
  tick: 0,
}
