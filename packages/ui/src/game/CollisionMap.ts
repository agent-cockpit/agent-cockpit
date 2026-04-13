export interface Rect { x: number; y: number; w: number; h: number }
export const PLAYER_HITBOX = { offsetX: 16, offsetY: 32, w: 32, h: 32 }
export class CollisionMap {
  loadTerrain(_data: unknown): void { /* stub */ }
  loadObjects(_objects: unknown[]): void { /* stub */ }
  overlaps(_x: number, _y: number, _w: number, _h: number): boolean { return false }
}
