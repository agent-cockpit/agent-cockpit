import { WORLD_W, WORLD_H } from './GameState.js'
import type { Direction } from '../components/office/spriteStates.js'
import type { CollisionMap } from './CollisionMap.js'
import { PLAYER_HITBOX } from './CollisionMap.js'

export const PLAYER_SPEED = 120 // pixels per second (×2 zoom = 144 visual px/s)
export const WALK_FRAME_DURATION_MS = 100  // 10fps walk cycle — natural humanoid gait (was 150)
export const WALK_FRAME_COUNT = 8

const INV_SQRT2 = 0.7071

const keysDown = new Set<string>()
let _attached = false

function onKeyDown(e: KeyboardEvent): void {
  const active = document.activeElement
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  ) {
    return
  }
  keysDown.add(e.code)
  // Prevent page scroll for arrow keys
  if (
    e.code === 'ArrowUp' ||
    e.code === 'ArrowDown' ||
    e.code === 'ArrowLeft' ||
    e.code === 'ArrowRight'
  ) {
    e.preventDefault()
  }
}

function onKeyUp(e: KeyboardEvent): void {
  keysDown.delete(e.code)
}

export function attachInput(): void {
  if (_attached) return
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  _attached = true
}

export function detachInput(): void {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  keysDown.clear()
  _attached = false
}

export function getKeysDown(): ReadonlySet<string> {
  return keysDown
}

function deriveDirection(dx: number, dy: number): Direction | null {
  if (dx === 0 && dy === 0) return null
  if (dx > 0 && dy < 0) return 'north-east'
  if (dx < 0 && dy < 0) return 'north-west'
  if (dx > 0 && dy > 0) return 'south-east'
  if (dx < 0 && dy > 0) return 'south-west'
  if (dx > 0) return 'east'
  if (dx < 0) return 'west'
  if (dy < 0) return 'north'
  return 'south'
}

export function movePlayer(
  player: { x: number; y: number; direction: string; animTime: number },
  keys: ReadonlySet<string>,
  deltaMs: number,
  collisionMap?: CollisionMap,
): void {
  const dt = deltaMs / 1000
  const dist = PLAYER_SPEED * dt

  const up = keys.has('KeyW') || keys.has('ArrowUp')
  const down = keys.has('KeyS') || keys.has('ArrowDown')
  const left = keys.has('KeyA') || keys.has('ArrowLeft')
  const right = keys.has('KeyD') || keys.has('ArrowRight')

  let dx = (right ? 1 : 0) - (left ? 1 : 0)
  let dy = (down ? 1 : 0) - (up ? 1 : 0)

  if (dx !== 0 && dy !== 0) {
    dx *= INV_SQRT2
    dy *= INV_SQRT2
  }

  const newX = player.x + dx * dist
  const newY = player.y + dy * dist
  const clampedX = Math.max(0, Math.min(newX, WORLD_W - 64))
  const clampedY = Math.max(0, Math.min(newY, WORLD_H - 64))
  if (collisionMap) {
    // Resolve X first, then resolve Y against the updated X. This prevents
    // diagonal corner clipping when only the final diagonal position overlaps.
    const xBlocked = collisionMap.overlaps(
      clampedX + PLAYER_HITBOX.offsetX,
      player.y + PLAYER_HITBOX.offsetY,
      PLAYER_HITBOX.w,
      PLAYER_HITBOX.h,
    )
    const resolvedX = xBlocked ? player.x : clampedX

    const yBlocked = collisionMap.overlaps(
      resolvedX + PLAYER_HITBOX.offsetX,
      clampedY + PLAYER_HITBOX.offsetY,
      PLAYER_HITBOX.w,
      PLAYER_HITBOX.h,
    )

    player.x = resolvedX
    player.y = yBlocked ? player.y : clampedY
  } else {
    player.x = clampedX
    player.y = clampedY
  }

  const direction = deriveDirection(dx, dy)
  if (direction !== null) {
    player.direction = direction
  }

  const isMoving = dx !== 0 || dy !== 0  // use actual displacement, not key booleans — fixes opposing-key moonwalk
  if (isMoving) {
    player.animTime += deltaMs
  } else {
    player.animTime = 0
  }
}
