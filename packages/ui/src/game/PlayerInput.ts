import { WORLD_W, WORLD_H } from './GameState.js'
import type { Direction } from '../components/office/spriteStates.js'
import type { CollisionMap } from './CollisionMap.js'
import { PLAYER_HITBOX } from './CollisionMap.js'

export const PLAYER_SPEED = 120 // pixels per second (×2 zoom = 144 visual px/s)
export const PLAYER_SPRINT_MULTIPLIER = 1.8
export const WALK_FRAME_DURATION_MS = 100  // 10fps walk cycle — natural humanoid gait (was 150)
export const WALK_FRAME_COUNT = 8

const INV_SQRT2 = 0.7071

const keysDown = new Set<string>()
let _attached = false

function clearKeysDown(): void {
  keysDown.clear()
}

function isTextInputFocused(active: Element | null): boolean {
  return (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  )
}

function onKeyDown(e: KeyboardEvent): void {
  if (isTextInputFocused(document.activeElement)) {
    clearKeysDown()
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

function onWindowBlur(): void {
  clearKeysDown()
}

function onVisibilityChange(): void {
  if (document.visibilityState !== 'visible') {
    clearKeysDown()
  }
}

export function attachInput(): void {
  if (_attached) return
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onWindowBlur)
  document.addEventListener('visibilitychange', onVisibilityChange)
  _attached = true
}

export function detachInput(): void {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onWindowBlur)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  clearKeysDown()
  _attached = false
}

export function getKeysDown(): ReadonlySet<string> {
  return keysDown
}

interface BlockingRect { x: number; y: number; w: number; h: number }

function rectsOverlap(a: BlockingRect, b: BlockingRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function blockedByDynamicRects(
  nextPlayerX: number,
  nextPlayerY: number,
  currentPlayerX: number,
  currentPlayerY: number,
  blockingRects: ReadonlyArray<BlockingRect>,
): boolean {
  if (blockingRects.length === 0) return false

  const nextHitbox = {
    x: nextPlayerX + PLAYER_HITBOX.offsetX,
    y: nextPlayerY + PLAYER_HITBOX.offsetY,
    w: PLAYER_HITBOX.w,
    h: PLAYER_HITBOX.h,
  }
  const currentHitbox = {
    x: currentPlayerX + PLAYER_HITBOX.offsetX,
    y: currentPlayerY + PLAYER_HITBOX.offsetY,
    w: PLAYER_HITBOX.w,
    h: PLAYER_HITBOX.h,
  }

  for (const rect of blockingRects) {
    if (!rectsOverlap(nextHitbox, rect)) continue
    // Allow escaping from an existing overlap (e.g. spawned/teleported onto an NPC),
    // but still block entering new overlaps.
    if (!rectsOverlap(currentHitbox, rect)) return true
  }

  return false
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
  blockingRects: ReadonlyArray<BlockingRect> = [],
): void {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
    player.animTime = 0
    return
  }

  const dt = deltaMs / 1000
  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('Shift')
  const speed = PLAYER_SPEED * (sprint ? PLAYER_SPRINT_MULTIPLIER : 1)
  const dist = speed * dt

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

  if (collisionMap || blockingRects.length > 0) {
    // Resolve X first, then resolve Y against the updated X. This prevents
    // diagonal corner clipping when only the final diagonal position overlaps.
    const xBlockedByMap = collisionMap?.overlaps(
      clampedX + PLAYER_HITBOX.offsetX,
      player.y + PLAYER_HITBOX.offsetY,
      PLAYER_HITBOX.w,
      PLAYER_HITBOX.h,
    ) ?? false
    const xBlockedByNpcs = blockedByDynamicRects(
      clampedX,
      player.y,
      player.x,
      player.y,
      blockingRects,
    )
    const xBlocked = xBlockedByMap || xBlockedByNpcs
    const resolvedX = xBlocked ? player.x : clampedX

    const yBlockedByMap = collisionMap?.overlaps(
      resolvedX + PLAYER_HITBOX.offsetX,
      clampedY + PLAYER_HITBOX.offsetY,
      PLAYER_HITBOX.w,
      PLAYER_HITBOX.h,
    ) ?? false
    const yBlockedByNpcs = blockedByDynamicRects(
      resolvedX,
      clampedY,
      resolvedX,
      player.y,
      blockingRects,
    )
    const yBlocked = yBlockedByMap || yBlockedByNpcs

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
