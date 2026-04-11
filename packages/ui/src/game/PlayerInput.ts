import { WORLD_W, WORLD_H } from './GameState.js'
import type { Direction } from '../components/office/spriteStates.js'

export const PLAYER_SPEED = 120 // pixels per second

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
  player: { x: number; y: number; direction: string },
  keys: ReadonlySet<string>,
  deltaMs: number,
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

  player.x = Math.max(0, Math.min(player.x + dx * dist, WORLD_W - 64))
  player.y = Math.max(0, Math.min(player.y + dy * dist, WORLD_H - 64))

  const direction = deriveDirection(dx, dy)
  if (direction !== null) {
    player.direction = direction
  }
}
