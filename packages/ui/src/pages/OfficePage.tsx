// DnD removed in Phase 15-03. Positions are owned by gameState.npcs. Zone assignment in Phase 17.

import { useRef, useEffect, useState } from 'react'
import { useStore } from '../store/index.js'
import { useActiveSessions } from '../store/selectors.js'
import { sendWsMessage } from '../hooks/useSessionEvents.js'
import { audioSystem } from '../audio/audioSystem.js'
import { getSessionTitle } from '../lib/sessionTitle.js'
import { InstancePopupHub } from '../components/office/InstancePopupHub.js'
import { MenuPopup } from '../components/office/MenuPopup.js'
import { EjectAllSessionsDialog } from '../components/office/EjectAllSessionsDialog.js'
import { ClosetPopup } from '../components/office/ClosetPopup.js'
import { ApprovalBalloonOverlay } from '../components/office/ApprovalBalloonOverlay.js'
import { drawAgentSprite } from '../components/office/AgentSprite.js'
import { drawMiniMap, MINIMAP_MAP_W, MINIMAP_MAP_H } from '../components/office/MiniMap.js'

import { DIRECTION_ROWS, STATE_ROW_OFFSET } from '../components/office/spriteStates.js'
import type { Direction } from '../components/office/spriteStates.js'
import { characterFaceUrl, type CharacterType } from '../components/office/characterMapping.js'
import { GameEngine } from '../game/GameEngine.js'
import { gameState, setWorldBounds, WORLD_W, WORLD_H } from '../game/GameState.js'
import { updateCamera } from '../game/Camera.js'
import {
  attachInput,
  detachInput,
  getKeysDown,
  movePlayer,
  PLAYER_SPEED,
  WALK_FRAME_DURATION_MS,
  WALK_FRAME_COUNT,
} from '../game/PlayerInput.js'
import { TilemapRenderer, type MapsManifest } from '../game/TilemapRenderer.js'
import { CollisionMap, PLAYER_HITBOX } from '../game/CollisionMap.js'
import {
  stepNpcBehaviors,
  NPC_SPRITE_SIZE_PX,
  type NpcRuntimeState,
} from '../game/NpcBehavior.js'
import {
  buildWalkGrid,
  type WalkGrid,
} from '../game/NpcPathfinding.js'

// Module-level sidebar focus callback for MapSidebar compatibility.
let _scrollToSession: ((id: string) => void) | null = null
export function scrollToSession(id: string) { _scrollToSession?.(id) }

type MapObject = Parameters<CollisionMap['loadObjects']>[0][number]
type ObjectAlphaBoundsMap = Parameters<CollisionMap['loadObjects']>[1]
interface SceneFxPatterns {
  noise: CanvasPattern | null
  scanlines: CanvasPattern | null
}

interface AxisAlignedRect {
  x: number
  y: number
  w: number
  h: number
}

interface CollisionProbe {
  overlaps: CollisionMap['overlaps']
}

/** Verified walkable spawn positions for NPC agents (world pixel coords).
 * Slots are validated against terrain + object collisions using PLAYER_HITBOX.
 * Coordinates stay on open floor around map center to avoid wall/object edge spawns.
 * findNearestFreeNpcSpawnPosition corrects any slot that lands in a wall at runtime.
 */
const SPAWN_SLOTS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 1984, y: 1888 }, { x: 2048, y: 1888 }, { x: 2112, y: 1888 }, { x: 2176, y: 1888 },
  { x: 2016, y: 1920 }, { x: 2080, y: 1920 }, { x: 2144, y: 1920 },
  { x: 1952, y: 1952 }, { x: 2016, y: 1952 },
  { x: 1920, y: 2112 }, { x: 1984, y: 2112 }, { x: 2048, y: 2112 },
  // Extended slots — prevents visual overlap for sessions 13-24
  { x: 2048, y: 1952 }, { x: 2112, y: 1952 }, { x: 2176, y: 1952 },
  { x: 1952, y: 2048 }, { x: 2016, y: 2048 }, { x: 2080, y: 2048 },
  { x: 2144, y: 2048 }, { x: 1920, y: 2080 }, { x: 1984, y: 2080 },
  { x: 2048, y: 2080 }, { x: 2112, y: 2080 }, { x: 2048, y: 2144 },
] as const

/** Deterministic slot offset derived from workspacePath so same-workspace NPCs cluster together. */
function workspaceSlotOffset(workspacePath: string): number {
  let h = 0
  for (let i = 0; i < workspacePath.length; i++) {
    h = (Math.imul(31, h) + workspacePath.charCodeAt(i)) >>> 0
  }
  return h % SPAWN_SLOTS.length
}

/** NPCs stop when player center is within this distance of NPC center. */
const NPC_PLAYER_PROXIMITY_PX = 120
const NPC_PROXIMITY_HALF_SIZE = NPC_SPRITE_SIZE_PX / 2

/** Pixel offset applied per cycle to prevent exact NPC stacking when sessions > 12. */
const SPAWN_JITTER = 16
const PLAYER_SPRITE_SIZE_PX = NPC_SPRITE_SIZE_PX
const INTERACT_RADIUS_PX = 64
// Emergency eject switch world coords (id: 1310f540-..., boundingBox x=227 y=741 w=32 h=32)
// objectOriginX = (1 - tileOriginX) * 32 = (1 - (-46)) * 32 = 1504
// objectOriginY = (2 - tileOriginY) * 32 = (2 - (-43)) * 32 = 1440
// Visual Y is shifted up by OBJECT_RENDER_ANCHOR_Y_PX (32px) to match map-composite placement
const EJECT_SWITCH_WORLD_X = 227 + 1504          // 1731
const EJECT_SWITCH_WORLD_Y = 741 - 32 + 1440     // 2149
const EJECT_SWITCH_CENTER_X = EJECT_SWITCH_WORLD_X + 16
const EJECT_SWITCH_CENTER_Y = EJECT_SWITCH_WORLD_Y + 16
const EJECT_SWITCH_INTERACT_RADIUS_PX = 72
// Closet (1df56ff5) — boundingBox x=897 y=61 w=66 h=68
const CLOSET_WORLD_X = 897 + 1504                // 2401
const CLOSET_WORLD_Y = 61 - 32 + 1440            // 1469
const CLOSET_CENTER_X = CLOSET_WORLD_X + 33
const CLOSET_CENTER_Y = CLOSET_WORLD_Y + 34
const CLOSET_INTERACT_RADIUS_PX = 80
// Audio desk (040bf22f) — boundingBox x=496 y=75 w=91 h=63
const AUDIO_DESK_WORLD_X = 496 + 1504            // 2000
const AUDIO_DESK_WORLD_Y = 75 - 32 + 1440        // 1483
const AUDIO_DESK_CENTER_X = AUDIO_DESK_WORLD_X + 45
const AUDIO_DESK_CENTER_Y = AUDIO_DESK_WORLD_Y + 31
const AUDIO_DESK_INTERACT_RADIUS_PX = 80
const FOOTSTEP_CONTACT_FRAMES = [0, 4] as const
const TELEPORT_SEARCH_STEP_PX = 16
const TELEPORT_SEARCH_RADIUS_PX = 512
const NPC_SPAWN_SEARCH_STEP_PX = 16
const NPC_SPAWN_SEARCH_RADIUS_PX = 320
const NPC_STUCK_WARNING_MS = 2000
const NPC_STUCK_HARD_FAIL_MS = 6000
const NPC_REPLAN_FAILS_FOR_RECOVERY = 3
const NPC_POSITION_STORAGE_KEY = 'cockpit.npc.positions.v1'
const PLAYER_STATE_STORAGE_KEY = 'cockpit.player.state.v1'
const OFFICE_RUNTIME_TEARDOWN_KEY = '__cockpitOfficeRuntimeTeardown__'

interface WorldPosition {
  x: number
  y: number
}

type StoredNpcPositions = Record<string, WorldPosition>
type StoredPlayerState = WorldPosition & { direction: Direction }

interface OfficeRuntimeWindow extends Window {
  __cockpitOfficeRuntimeTeardown__?: () => void
}

function getOfficeRuntimeWindow(): OfficeRuntimeWindow | null {
  if (typeof window === 'undefined') return null
  return window as OfficeRuntimeWindow
}

function readStoredNpcPositions(): StoredNpcPositions {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(NPC_POSITION_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const normalized: StoredNpcPositions = {}
    for (const [sessionId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const pos = value as Record<string, unknown>
      const x = pos['x']
      const y = pos['y']
      if (typeof x !== 'number' || typeof y !== 'number') continue
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      normalized[sessionId] = { x, y }
    }
    return normalized
  } catch {
    return {}
  }
}

function writeStoredNpcPositions(positions: StoredNpcPositions): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(NPC_POSITION_STORAGE_KEY, JSON.stringify(positions))
  } catch {
    // Ignore storage failures and keep in-memory positions authoritative.
  }
}

function isDirection(value: unknown): value is Direction {
  return typeof value === 'string' && value in DIRECTION_ROWS
}

function readStoredPlayerState(): StoredPlayerState | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(PLAYER_STATE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const payload = parsed as Record<string, unknown>
    const x = payload['x']
    const y = payload['y']
    const direction = payload['direction']
    if (typeof x !== 'number' || typeof y !== 'number') return null
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    if (!isDirection(direction)) return null
    return { x, y, direction }
  } catch {
    return null
  }
}

function writeStoredPlayerState(state: StoredPlayerState): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(PLAYER_STATE_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage failures and keep in-memory player state authoritative.
  }
}

function isTextInputFocused(active: Element | null): boolean {
  return (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  )
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}

async function computeOpaqueBounds(src: string): Promise<{ x: number; y: number; w: number; h: number } | null> {
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data

  // Ignore near-transparent glow/AA pixels so colliders fit the visible body.
  const ALPHA_SOLID_THRESHOLD = 24
  let minX = canvas.width
  let minY = canvas.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const alpha = data[(y * canvas.width + x) * 4 + 3]
      if (alpha < ALPHA_SOLID_THRESHOLD) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (maxX < minX || maxY < minY) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

async function buildObjectAlphaBounds(objects: MapObject[], mapDir: string): Promise<ObjectAlphaBoundsMap> {
  const entries = await Promise.all(objects.map(async (obj) => {
    if (!obj.filename) return null
    try {
      const bounds = await computeOpaqueBounds(`${mapDir}/objects/${obj.filename}`)
      if (!bounds) return null
      return [obj.filename, bounds] as const
    } catch {
      return null
    }
  }))

  const map: ObjectAlphaBoundsMap = {}
  for (const entry of entries) {
    if (!entry) continue
    const [filename, bounds] = entry
    map[filename] = bounds
  }
  return map
}

function createNoisePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const noiseCanvas = document.createElement('canvas')
  noiseCanvas.width = 64
  noiseCanvas.height = 64
  const noiseCtx = noiseCanvas.getContext('2d')
  if (!noiseCtx) return null

  const img = noiseCtx.createImageData(64, 64)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = Math.floor(Math.random() * 256)
    img.data[i] = n
    img.data[i + 1] = n
    img.data[i + 2] = n
    img.data[i + 3] = 36
  }
  noiseCtx.putImageData(img, 0, 0)
  return ctx.createPattern(noiseCanvas, 'repeat')
}

function createScanlinePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const lineCanvas = document.createElement('canvas')
  lineCanvas.width = 2
  lineCanvas.height = 4
  const lineCtx = lineCanvas.getContext('2d')
  if (!lineCtx) return null
  lineCtx.fillStyle = 'rgba(0,0,0,0.45)'
  lineCtx.fillRect(0, 0, 2, 1)
  lineCtx.fillStyle = 'rgba(255,255,255,0.08)'
  lineCtx.fillRect(0, 2, 2, 1)
  return ctx.createPattern(lineCanvas, 'repeat')
}

function drawEntityShadow(ctx: CanvasRenderingContext2D, x: number, y: number, size = 1): void {
  ctx.save()
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)'
  ctx.beginPath()
  ctx.ellipse(x + 32, y + 56, 14 * size, 6 * size, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawWorldOverlay(ctx: CanvasRenderingContext2D, viewportW: number, viewportH: number): void {
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  const grad = ctx.createLinearGradient(0, 0, 0, viewportH)
  grad.addColorStop(0, 'rgba(8, 16, 32, 0.12)')
  grad.addColorStop(0.65, 'rgba(6, 10, 24, 0.06)')
  grad.addColorStop(1, 'rgba(4, 7, 18, 0.18)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, viewportW, viewportH)
  ctx.restore()
}

function drawScreenOverlays(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  patterns: SceneFxPatterns,
  tick: number,
): void {
  ctx.save()
  const vignette = ctx.createRadialGradient(
    w * 0.5,
    h * 0.5,
    Math.min(w, h) * 0.18,
    w * 0.5,
    h * 0.5,
    Math.max(w, h) * 0.72,
  )
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)')
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.34)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, w, h)
  ctx.restore()

  if (patterns.scanlines) {
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = 0.1
    ctx.fillStyle = patterns.scanlines
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }

  if (patterns.noise) {
    ctx.save()
    ctx.globalCompositeOperation = 'overlay'
    ctx.globalAlpha = 0.07
    const drift = tick % 64
    ctx.translate(drift * 0.5, drift * 0.25)
    ctx.fillStyle = patterns.noise
    ctx.fillRect(-64, -64, w + 128, h + 128)
    ctx.restore()
  }
}

function rectsOverlap(a: AxisAlignedRect, b: AxisAlignedRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function clampPlayerPositionToWorld(pos: WorldPosition): WorldPosition {
  return {
    x: Math.max(0, Math.min(pos.x, Math.max(0, WORLD_W - PLAYER_SPRITE_SIZE_PX))),
    y: Math.max(0, Math.min(pos.y, Math.max(0, WORLD_H - PLAYER_SPRITE_SIZE_PX))),
  }
}

function playerHitboxAt(pos: WorldPosition): AxisAlignedRect {
  return {
    x: pos.x + PLAYER_HITBOX.offsetX,
    y: pos.y + PLAYER_HITBOX.offsetY,
    w: PLAYER_HITBOX.w,
    h: PLAYER_HITBOX.h,
  }
}

function playerSpriteRectAt(pos: WorldPosition): AxisAlignedRect {
  return {
    x: pos.x,
    y: pos.y,
    w: PLAYER_SPRITE_SIZE_PX,
    h: PLAYER_SPRITE_SIZE_PX,
  }
}

function npcHitboxAt(pos: WorldPosition): AxisAlignedRect {
  return {
    x: pos.x + PLAYER_HITBOX.offsetX,
    y: pos.y + PLAYER_HITBOX.offsetY,
    w: PLAYER_HITBOX.w,
    h: PLAYER_HITBOX.h,
  }
}

function canOccupyNpcPosition(
  candidate: WorldPosition,
  occupiedNpcHitboxes: ReadonlyArray<AxisAlignedRect>,
  playerHitbox: AxisAlignedRect,
  collisionProbe: CollisionProbe | null,
  allowSolidOverlap = false,
  allowNpcOverlap = false,
  allowPlayerOverlap = false,
): boolean {
  const candidateHitbox = npcHitboxAt(candidate)
  if (!allowPlayerOverlap && rectsOverlap(candidateHitbox, playerHitbox)) return false
  const overlapsNpc = occupiedNpcHitboxes.some((hitbox) => rectsOverlap(candidateHitbox, hitbox))
  if (overlapsNpc && !allowNpcOverlap) return false
  if (
    !allowSolidOverlap &&
    collisionProbe?.overlaps(candidateHitbox.x, candidateHitbox.y, candidateHitbox.w, candidateHitbox.h)
  ) {
    return false
  }
  return true
}

function resolveNpcMovementPosition(
  current: WorldPosition,
  desired: WorldPosition,
  occupiedNpcHitboxes: ReadonlyArray<AxisAlignedRect>,
  playerHitbox: AxisAlignedRect,
  collisionProbe: CollisionProbe | null,
): WorldPosition {
  const clampedCurrent = clampPlayerPositionToWorld(current)
  const clampedDesired = clampPlayerPositionToWorld(desired)
  const currentHitbox = npcHitboxAt(clampedCurrent)
  const escapingNpcOverlap = occupiedNpcHitboxes.some((hitbox) => rectsOverlap(currentHitbox, hitbox))
  const escapingPlayerOverlap = rectsOverlap(currentHitbox, playerHitbox)
  const escapingSolidOverlap = collisionProbe?.overlaps(
    currentHitbox.x,
    currentHitbox.y,
    currentHitbox.w,
    currentHitbox.h,
  ) ?? false

  if (
    canOccupyNpcPosition(
      clampedDesired,
      occupiedNpcHitboxes,
      playerHitbox,
      collisionProbe,
      escapingSolidOverlap,
      escapingNpcOverlap,
      escapingPlayerOverlap,
    )
  ) {
    return clampedDesired
  }

  const xOnly = clampPlayerPositionToWorld({ x: clampedDesired.x, y: clampedCurrent.y })
  if (
    canOccupyNpcPosition(
      xOnly,
      occupiedNpcHitboxes,
      playerHitbox,
      collisionProbe,
      escapingSolidOverlap,
      escapingNpcOverlap,
      escapingPlayerOverlap,
    )
  ) {
    return xOnly
  }

  const yOnly = clampPlayerPositionToWorld({ x: clampedCurrent.x, y: clampedDesired.y })
  if (
    canOccupyNpcPosition(
      yOnly,
      occupiedNpcHitboxes,
      playerHitbox,
      collisionProbe,
      escapingSolidOverlap,
      escapingNpcOverlap,
      escapingPlayerOverlap,
    )
  ) {
    return yOnly
  }

  for (const detourStep of [14, 32, 64]) {
    const detourCandidates = [
      { x: clampedCurrent.x + detourStep, y: clampedCurrent.y },
      { x: clampedCurrent.x - detourStep, y: clampedCurrent.y },
      { x: clampedCurrent.x, y: clampedCurrent.y + detourStep },
      { x: clampedCurrent.x, y: clampedCurrent.y - detourStep },
      { x: clampedCurrent.x + detourStep, y: clampedCurrent.y + detourStep },
      { x: clampedCurrent.x + detourStep, y: clampedCurrent.y - detourStep },
      { x: clampedCurrent.x - detourStep, y: clampedCurrent.y + detourStep },
      { x: clampedCurrent.x - detourStep, y: clampedCurrent.y - detourStep },
    ]
      .map((pos) => clampPlayerPositionToWorld(pos))
      .sort((a, b) => {
        const da = Math.hypot(a.x - clampedDesired.x, a.y - clampedDesired.y)
        const db = Math.hypot(b.x - clampedDesired.x, b.y - clampedDesired.y)
        return da - db
      })

    for (const candidate of detourCandidates) {
      if (
        canOccupyNpcPosition(
          candidate,
          occupiedNpcHitboxes,
          playerHitbox,
          collisionProbe,
          escapingSolidOverlap,
          escapingNpcOverlap,
          escapingPlayerOverlap,
        )
      ) {
        return candidate
      }
    }
  }

  return clampedCurrent
}

export function derivePausedNpcSessionIds(sessionIds: ReadonlyArray<string>): Set<string> {
  if (sessionIds.length === 0) return new Set()
  return new Set(sessionIds)
}

function findNearestFreeNpcSpawnPosition(
  targetPos: WorldPosition,
  occupiedNpcHitboxes: ReadonlyArray<AxisAlignedRect>,
  playerHitbox: AxisAlignedRect,
  collisionProbe: CollisionProbe | null,
): WorldPosition {
  const clampedTarget = clampPlayerPositionToWorld(targetPos)
  if (canOccupyNpcPosition(clampedTarget, occupiedNpcHitboxes, playerHitbox, collisionProbe)) {
    return clampedTarget
  }

  const candidates: Array<{ pos: WorldPosition; distanceSq: number; absDx: number; absDy: number }> = []
  const seen = new Set<string>()
  for (let dy = -NPC_SPAWN_SEARCH_RADIUS_PX; dy <= NPC_SPAWN_SEARCH_RADIUS_PX; dy += NPC_SPAWN_SEARCH_STEP_PX) {
    for (let dx = -NPC_SPAWN_SEARCH_RADIUS_PX; dx <= NPC_SPAWN_SEARCH_RADIUS_PX; dx += NPC_SPAWN_SEARCH_STEP_PX) {
      const candidate = clampPlayerPositionToWorld({
        x: clampedTarget.x + dx,
        y: clampedTarget.y + dy,
      })
      const key = `${candidate.x},${candidate.y}`
      if (seen.has(key)) continue
      seen.add(key)

      const deltaX = candidate.x - clampedTarget.x
      const deltaY = candidate.y - clampedTarget.y
      candidates.push({
        pos: candidate,
        distanceSq: deltaX * deltaX + deltaY * deltaY,
        absDx: Math.abs(deltaX),
        absDy: Math.abs(deltaY),
      })
    }
  }

  candidates.sort((a, b) => {
    if (a.distanceSq !== b.distanceSq) return a.distanceSq - b.distanceSq
    if (a.absDx !== b.absDx) return a.absDx - b.absDx
    if (a.absDy !== b.absDy) return a.absDy - b.absDy
    if (a.pos.y !== b.pos.y) return a.pos.y - b.pos.y
    return a.pos.x - b.pos.x
  })

  for (const candidate of candidates) {
    if (canOccupyNpcPosition(candidate.pos, occupiedNpcHitboxes, playerHitbox, collisionProbe)) {
      return candidate.pos
    }
  }

  return clampedTarget
}

function isTeleportSpotFree(
  pos: WorldPosition,
  occupiedSpriteRects: ReadonlyArray<AxisAlignedRect>,
  collisionProbe: CollisionProbe | null,
): boolean {
  const candidateHitbox = playerHitboxAt(pos)
  const candidateSpriteRect = playerSpriteRectAt(pos)
  if (collisionProbe?.overlaps(candidateHitbox.x, candidateHitbox.y, candidateHitbox.w, candidateHitbox.h)) {
    return false
  }
  return occupiedSpriteRects.every((rect) => !rectsOverlap(candidateSpriteRect, rect))
}

function findNearestFreeTeleportPosition(
  targetPos: WorldPosition,
  occupiedSpriteRects: ReadonlyArray<AxisAlignedRect>,
  collisionProbe: CollisionProbe | null,
): WorldPosition {
  const clampedTarget = clampPlayerPositionToWorld(targetPos)
  const maxLayer = Math.ceil(TELEPORT_SEARCH_RADIUS_PX / TELEPORT_SEARCH_STEP_PX)
  const seen = new Set<string>()

  // Enumerate positions layer-by-layer (Chebyshev rings) for early exit.
  // Each ring is sorted with the same comparator as the original full-sort so
  // the first free slot found is equivalent to the original winner in the
  // common (non-boundary-clamped) case.
  for (let layer = 0; layer <= maxLayer; layer++) {
    const dist = layer * TELEPORT_SEARCH_STEP_PX
    const ring: Array<{ pos: WorldPosition; distanceSq: number; absDx: number; absDy: number }> = []

    for (let dx = -dist; dx <= dist; dx += TELEPORT_SEARCH_STEP_PX) {
      for (let dy = -dist; dy <= dist; dy += TELEPORT_SEARCH_STEP_PX) {
        // Only the border of this Chebyshev layer (skip interior for layer > 0)
        if (layer > 0 && Math.abs(dx) < dist && Math.abs(dy) < dist) continue
        const candidate = clampPlayerPositionToWorld({ x: clampedTarget.x + dx, y: clampedTarget.y + dy })
        const key = `${candidate.x},${candidate.y}`
        if (seen.has(key)) continue
        seen.add(key)
        const deltaX = candidate.x - clampedTarget.x
        const deltaY = candidate.y - clampedTarget.y
        ring.push({
          pos: candidate,
          distanceSq: deltaX * deltaX + deltaY * deltaY,
          absDx: Math.abs(deltaX),
          absDy: Math.abs(deltaY),
        })
      }
    }

    ring.sort((a, b) => {
      if (a.distanceSq !== b.distanceSq) return a.distanceSq - b.distanceSq
      if (a.absDx !== b.absDx) return a.absDx - b.absDx
      if (a.absDy !== b.absDy) return a.absDy - b.absDy
      if (a.pos.y !== b.pos.y) return a.pos.y - b.pos.y
      return a.pos.x - b.pos.x
    })

    for (const candidate of ring) {
      if (isTeleportSpotFree(candidate.pos, occupiedSpriteRects, collisionProbe)) {
        return candidate.pos
      }
    }
  }

  return clampedTarget
}

function hasMovementInput(keysDown: ReadonlySet<string>): boolean {
  return (
    keysDown.has('KeyW') ||
    keysDown.has('ArrowUp') ||
    keysDown.has('KeyS') ||
    keysDown.has('ArrowDown') ||
    keysDown.has('KeyA') ||
    keysDown.has('ArrowLeft') ||
    keysDown.has('KeyD') ||
    keysDown.has('ArrowRight')
  )
}

function deriveDirectionFromDelta(dx: number, dy: number, fallback: Direction): Direction {
  const epsilon = 0.01
  if (Math.abs(dx) < epsilon && Math.abs(dy) < epsilon) return fallback
  if (dx > 0 && dy < 0) return 'north-east'
  if (dx < 0 && dy < 0) return 'north-west'
  if (dx > 0 && dy > 0) return 'south-east'
  if (dx < 0 && dy > 0) return 'south-west'
  if (dx > 0) return 'east'
  if (dx < 0) return 'west'
  if (dy < 0) return 'north'
  return 'south'
}

function PopupDockAvatar({ character, label }: { character: CharacterType; label: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span
        aria-label={`${label} avatar fallback`}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center border border-[color-mix(in_srgb,var(--color-cockpit-accent)_55%,transparent)] bg-[color-mix(in_srgb,var(--color-cockpit-accent)_18%,transparent)] text-[9px] font-semibold uppercase text-[var(--color-cockpit-accent)]"
      >
        {character[0]}
      </span>
    )
  }
  return (
    <img
      src={characterFaceUrl(character)}
      alt={`${label} avatar`}
      width={20}
      height={20}
      onError={() => setFailed(true)}
      style={{ imageRendering: 'pixelated' }}
      className="h-5 w-5 shrink-0 object-cover"
    />
  )
}

const POPUP_DOCK_STATUS_DOT: Record<'active' | 'ended' | 'error', string> = {
  active: 'bg-green-400',
  ended: 'bg-gray-400',
  error: 'bg-red-400',
}

export function OfficePage() {
  const sessions = useActiveSessions()
  const liveSessionsById = useStore((s) => s.sessions)
  const historySessionsById = useStore((s) => s.historySessions)
  const sessionDetailOpen = useStore((s) => s.sessionDetailOpen)
  const popupWindows = useStore((s) => s.popupWindows)
  const popupWindowOrder = useStore((s) => s.popupWindowOrder)
  const selectedSessionId = useStore((s) => s.selectedSessionId)
  const selectedPlayerCharacter = useStore((s) => s.selectedPlayerCharacter)
  const setSessionDetailOpen = useStore((s) => s.setSessionDetailOpen)
  const setPopupPreferredTab = useStore((s) => s.setPopupPreferredTab)
  const closeSessionPopup = useStore((s) => s.closeSessionPopup)
  const minimizeSessionPopup = useStore((s) => s.minimizeSessionPopup)
  const restoreSessionPopup = useStore((s) => s.restoreSessionPopup)
  const bringSessionPopupToFront = useStore((s) => s.bringSessionPopupToFront)
  const setSessionPopupRect = useStore((s) => s.setSessionPopupRect)
  const clearSessionPopupPreferredTab = useStore((s) => s.clearSessionPopupPreferredTab)
  const [audioOpen, setAudioOpen] = useState(false)
  const [closetOpen, setClosetOpen] = useState(false)
  const [ejectDialogOpen, setEjectDialogOpen] = useState(false)
  const [ejectProcessing, setEjectProcessing] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const playerImgRef = useRef<HTMLImageElement | null>(null)
  const sceneFxPatternsRef = useRef<SceneFxPatterns>({ noise: null, scanlines: null })
  const interactableSessionRef = useRef<string | null>(null)
  const interactButtonAnchorRef = useRef<HTMLDivElement | null>(null)
  const ejectButtonAnchorRef = useRef<HTMLDivElement | null>(null)
  const ejectSwitchNearRef = useRef(false)
  const closetButtonAnchorRef = useRef<HTMLDivElement | null>(null)
  const closetNearRef = useRef(false)
  const audioDeskButtonAnchorRef = useRef<HTMLDivElement | null>(null)
  const audioDeskNearRef = useRef(false)
  const balloonRefsMap = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const collisionMapRef = useRef<CollisionMap | null>(null)
  const persistedNpcPositionsRef = useRef<StoredNpcPositions>(readStoredNpcPositions())
  const persistedPlayerStateRef = useRef<StoredPlayerState | null>(null)
  const lastPlayerPersistAtRef = useRef<number>(0)
  const selectedPlayerCharacterRef = useRef<CharacterType>(selectedPlayerCharacter)
  const selectedSessionIdRef = useRef<string | null>(selectedSessionId)
  const sessionDetailOpenRef = useRef<boolean>(sessionDetailOpen)
  const visiblePopupSessionIdsRef = useRef<string[]>([])
  const previousNpcPositionsRef = useRef<Record<string, WorldPosition>>({})
  const npcDirectionBySessionRef = useRef<Record<string, Direction>>({})
  const npcAnimTimeMsBySessionRef = useRef<Record<string, number>>({})
  const npcMovingBySessionRef = useRef<Record<string, boolean>>({})
  const npcRuntimeBySessionRef = useRef<Record<string, NpcRuntimeState>>({})
  const npcWalkGridRef = useRef<WalkGrid | null>(null)
  const npcModeBySessionRef = useRef<Record<string, string>>({})
  const minimapBgRef = useRef<OffscreenCanvas | null>(null)
  const lastPlayerAnimFrameRef = useRef<number>(-1)
  const playerTeleportFlashFramesRef = useRef<number>(0)
  const popupGestureRef = useRef<{
    pointerId: number
    mode: 'move' | 'resize'
    sessionId: string
    startClientX: number
    startClientY: number
    startX: number
    startY: number
    startWidth: number
    startHeight: number
  } | null>(null)

  const orderedPopupSessionIds = popupWindowOrder.filter((id) => !!popupWindows[id])
  const visiblePopupSessionIds = orderedPopupSessionIds.filter(
    (id) => !popupWindows[id]?.minimized,
  )
  const POPUP_MIN_WIDTH = 560
  const POPUP_MIN_HEIGHT = 360
  const POPUP_MARGIN = 8
  const POPUP_DOCK_RESERVE = 72

  function findNearestInteractableSessionId(): string | null {
    const playerCenterX = gameState.player.x + PLAYER_SPRITE_SIZE_PX / 2
    const playerCenterY = gameState.player.y + PLAYER_SPRITE_SIZE_PX / 2
    const maxDistanceSq = INTERACT_RADIUS_PX * INTERACT_RADIUS_PX
    let closestId: string | null = null
    let closestDistanceSq = Number.POSITIVE_INFINITY

    for (const [sessionId, pos] of Object.entries(gameState.npcs)) {
      const npcCenterX = pos.x + PLAYER_SPRITE_SIZE_PX / 2
      const npcCenterY = pos.y + PLAYER_SPRITE_SIZE_PX / 2
      const dx = npcCenterX - playerCenterX
      const dy = npcCenterY - playerCenterY
      const distanceSq = dx * dx + dy * dy
      if (distanceSq > maxDistanceSq || distanceSq >= closestDistanceSq) continue
      closestDistanceSq = distanceSq
      closestId = sessionId
    }

    return closestId
  }

  function focusSessionInWorld(sessionId: string): void {
    const pos = gameState.npcs[sessionId]
    if (!pos) return

    const occupiedNpcSpriteRects = Object.values(gameState.npcs).map((npcPos) => ({
      x: npcPos.x,
      y: npcPos.y,
      w: PLAYER_SPRITE_SIZE_PX,
      h: PLAYER_SPRITE_SIZE_PX,
    }))
    const safeTeleportPos = findNearestFreeTeleportPosition(
      pos,
      occupiedNpcSpriteRects,
      collisionMapRef.current,
    )

    // Teleport player to the closest free world position near the NPC and
    // snap camera instantly to keep focus interaction responsive.
    gameState.player.x = safeTeleportPos.x
    gameState.player.y = safeTeleportPos.y
    playerTeleportFlashFramesRef.current = 3
    const cam = gameState.camera
    cam.targetX = Math.max(0, Math.min(pos.x - cam.viewportW / 2, WORLD_W - cam.viewportW))
    cam.targetY = Math.max(0, Math.min(pos.y - cam.viewportH / 2, WORLD_H - cam.viewportH))
    cam.x = cam.targetX
    cam.y = cam.targetY
  }

  function openAgentChatPopup(sessionId: string): void {
    useStore.getState().selectSession(sessionId)
    useStore.getState().setHistoryMode?.(false)
    setPopupPreferredTab('chat')
    setSessionDetailOpen?.(true)
  }

  function startPopupGesture(
    mode: 'move' | 'resize',
    sessionId: string,
    pointerId: number,
    clientX: number,
    clientY: number,
  ): void {
    const popup = popupWindows[sessionId]
    if (!popup) return
    bringSessionPopupToFront(sessionId)
    popupGestureRef.current = {
      pointerId,
      mode,
      sessionId,
      startClientX: clientX,
      startClientY: clientY,
      startX: popup.x,
      startY: popup.y,
      startWidth: popup.width,
      startHeight: popup.height,
    }
  }

  function positionInteractButton(sessionId: string | null): void {
    const anchor = interactButtonAnchorRef.current
    const canvas = canvasRef.current
    if (!anchor || !canvas) return

    if (!sessionId) {
      anchor.style.display = 'none'
      return
    }

    const pos = gameState.npcs[sessionId]
    if (!pos) {
      anchor.style.display = 'none'
      return
    }

    const zoom = gameState.camera.zoom
    const screenX = (pos.x - gameState.camera.x + 42) * zoom
    const screenY = (pos.y - gameState.camera.y + 10) * zoom

    // Hide prompt when the target is far outside current viewport.
    if (
      screenX < -80 ||
      screenX > canvas.width + 80 ||
      screenY < -120 ||
      screenY > canvas.height + 80
    ) {
      anchor.style.display = 'none'
      return
    }

    anchor.style.display = 'block'
    anchor.style.left = `${screenX}px`
    anchor.style.top = `${screenY}px`
  }

  function positionObjectPrompt(
    anchor: HTMLDivElement | null,
    canvas: HTMLCanvasElement | null,
    centerX: number,
    centerY: number,
    near: boolean,
  ): void {
    if (!anchor || !canvas) return
    if (!near) { anchor.style.display = 'none'; return }
    const zoom = gameState.camera.zoom
    const screenX = (centerX - gameState.camera.x) * zoom
    const screenY = (centerY - 16 - gameState.camera.y) * zoom
    if (screenX < -80 || screenX > canvas.width + 80 || screenY < -120 || screenY > canvas.height + 80) {
      anchor.style.display = 'none'; return
    }
    anchor.style.display = 'block'
    anchor.style.left = `${screenX}px`
    anchor.style.top = `${screenY}px`
  }

  function updateApprovalBalloons(): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const zoom = gameState.camera.zoom
    for (const [sessionId, el] of balloonRefsMap.current) {
      if (!el) continue
      const pos = gameState.npcs[sessionId]
      if (!pos) {
        el.style.display = 'none'
        continue
      }
      const screenX = (pos.x - gameState.camera.x + 21) * zoom
      const screenY = (pos.y - gameState.camera.y) * zoom
      if (
        screenX < -300 ||
        screenX > canvas.width + 300 ||
        screenY < -300 ||
        screenY > canvas.height + 300
      ) {
        el.style.display = 'none'
        continue
      }
      el.style.display = 'block'
      el.style.left = `${screenX}px`
      el.style.top = `${screenY}px`
    }
  }

  // Register sidebar focus callback for map/session synchronization.
  useEffect(() => {
    _scrollToSession = (id: string) => {
      focusSessionInWorld(id)
    }
    return () => { _scrollToSession = null }
  }, [])

  useEffect(() => {
    selectedPlayerCharacterRef.current = selectedPlayerCharacter
    const playerImg = new Image()
    playerImg.src = `/sprites/${selectedPlayerCharacter}-sheet.png`
    playerImgRef.current = playerImg
  }, [selectedPlayerCharacter])

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId
  }, [selectedSessionId])

  useEffect(() => {
    sessionDetailOpenRef.current = sessionDetailOpen
  }, [sessionDetailOpen])

  useEffect(() => {
    visiblePopupSessionIdsRef.current = visiblePopupSessionIds
  }, [visiblePopupSessionIds])

  useEffect(() => {
    function handlePointerMove(event: PointerEvent): void {
      const gesture = popupGestureRef.current
      if (!gesture) return
      if (event.pointerId !== gesture.pointerId) return

      const hostBounds = containerRef.current?.getBoundingClientRect()
      const hostWidth = hostBounds?.width ?? window.innerWidth
      const hostHeight = hostBounds?.height ?? window.innerHeight
      const dx = event.clientX - gesture.startClientX
      const dy = event.clientY - gesture.startClientY

      if (gesture.mode === 'move') {
        const maxX = Math.max(POPUP_MARGIN, hostWidth - gesture.startWidth - POPUP_MARGIN)
        const maxY = Math.max(
          POPUP_MARGIN,
          hostHeight - gesture.startHeight - POPUP_DOCK_RESERVE,
        )
        const x = Math.min(maxX, Math.max(POPUP_MARGIN, gesture.startX + dx))
        const y = Math.min(maxY, Math.max(POPUP_MARGIN, gesture.startY + dy))
        setSessionPopupRect(gesture.sessionId, { x, y })
        return
      }

      const width = Math.min(
        Math.max(POPUP_MIN_WIDTH, gesture.startWidth + dx),
        Math.max(POPUP_MIN_WIDTH, hostWidth - gesture.startX - POPUP_MARGIN),
      )
      const height = Math.min(
        Math.max(POPUP_MIN_HEIGHT, gesture.startHeight + dy),
        Math.max(POPUP_MIN_HEIGHT, hostHeight - gesture.startY - POPUP_DOCK_RESERVE),
      )
      setSessionPopupRect(gesture.sessionId, { width, height })
    }

    function handlePointerUp(event: PointerEvent): void {
      const gesture = popupGestureRef.current
      if (!gesture) return
      if (event.pointerId !== gesture.pointerId) return
      popupGestureRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [setSessionPopupRect])

  useEffect(() => {
    const persisted = readStoredPlayerState()
    if (!persisted) return
    gameState.player.x = persisted.x
    gameState.player.y = persisted.y
    gameState.player.direction = persisted.direction
    persistedPlayerStateRef.current = persisted
  }, [])

  // Seed and normalize gameState.npcs from sessions.
  // Existing positions are preserved when valid, but stacked/invalid positions are de-overlapped.
  // Positions are persisted by sessionId so reload/rerender keeps stable world locations.
  useEffect(() => {
    const persistedNpcPositions = persistedNpcPositionsRef.current
    let didMutatePersistedPositions = false
    const resolvedSessionPositions: Record<string, WorldPosition> = {}
    const playerHitbox = playerHitboxAt({ x: gameState.player.x, y: gameState.player.y })

    // Sort by workspacePath so sessions from the same workspace get consecutive slots,
    // producing a natural cluster. Deterministic sort keeps slot assignment stable across renders.
    const orderedSessions = [...sessions].sort((a, b) =>
      (a.workspacePath ?? '').localeCompare(b.workspacePath ?? ''),
    )

    orderedSessions.forEach((session, i) => {
      const existing = gameState.npcs[session.sessionId]
      const persisted = persistedNpcPositions[session.sessionId]
      const baseOffset = workspaceSlotOffset(session.workspacePath ?? '')
      const slot = SPAWN_SLOTS[(baseOffset + i) % SPAWN_SLOTS.length]
      const cycle = Math.floor(i / SPAWN_SLOTS.length)
      const fallbackPos = {
        x: slot.x + (cycle > 0 ? (cycle % 3) * SPAWN_JITTER : 0),
        y: slot.y + (cycle > 0 ? Math.floor(cycle / 3) * SPAWN_JITTER : 0),
      }
      const basePos = clampPlayerPositionToWorld(existing ?? persisted ?? fallbackPos)

      const occupiedNpcHitboxes = Object.values(resolvedSessionPositions).map((pos) => npcHitboxAt(pos))
      const canKeepBasePos = existing
        ? canOccupyNpcPosition(basePos, occupiedNpcHitboxes, playerHitbox, collisionMapRef.current)
        : false

      const resolvedPos = canKeepBasePos
        ? basePos
        : findNearestFreeNpcSpawnPosition(
          basePos,
          occupiedNpcHitboxes,
          playerHitbox,
          collisionMapRef.current,
        )

      resolvedSessionPositions[session.sessionId] = resolvedPos
      if (!existing || existing.x !== resolvedPos.x || existing.y !== resolvedPos.y) {
        gameState.npcs[session.sessionId] = resolvedPos
      }

      const previousPersisted = persistedNpcPositions[session.sessionId]
      if (!previousPersisted || previousPersisted.x !== resolvedPos.x || previousPersisted.y !== resolvedPos.y) {
        persistedNpcPositions[session.sessionId] = resolvedPos
        didMutatePersistedPositions = true
      }
    })

    // Clean up sessions that ended
    const activeIds = new Set(sessions.map(s => s.sessionId))
    Object.keys(gameState.npcs).forEach(id => {
      if (!activeIds.has(id)) {
        delete gameState.npcs[id]
        delete npcRuntimeBySessionRef.current[id]
        if (persistedNpcPositions[id]) {
          delete persistedNpcPositions[id]
          didMutatePersistedPositions = true
        }
        return
      }

      const pos = gameState.npcs[id]
      if (!pos) return
      const persisted = persistedNpcPositions[id]
      if (!persisted || persisted.x !== pos.x || persisted.y !== pos.y) {
        persistedNpcPositions[id] = { x: pos.x, y: pos.y }
        didMutatePersistedPositions = true
      }
    })

    if (didMutatePersistedPositions) {
      writeStoredNpcPositions(persistedNpcPositions)
    }
  }, [sessions])

  // Game engine lifecycle: start on mount, stop on cleanup
  useEffect(() => {
    const runtimeWindow = getOfficeRuntimeWindow()
    runtimeWindow?.[OFFICE_RUNTIME_TEARDOWN_KEY]?.()

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) { console.error('[GameEngine] canvas 2d context unavailable'); return }
    let disposed = false
    gameState.worldTimeMs = 0

    const tilemapRenderer = new TilemapRenderer()
    // Load map assets before starting engine (non-blocking: engine starts after assets ready)
    const tilemapLoadPromise = tilemapRenderer
      .load()
      .then(() => {
        if (disposed) return
        setWorldBounds(tilemapRenderer.worldW || 3232, tilemapRenderer.worldH || 3232)
        // Pre-render minimap tilemap background (done once — map is static)
        try {
          const bg = new OffscreenCanvas(MINIMAP_MAP_W, MINIMAP_MAP_H)
          const bgCtx = bg.getContext('2d')
          if (bgCtx) {
            bgCtx.imageSmoothingEnabled = false
            tilemapRenderer.blitMinimap(bgCtx, 0, 0, MINIMAP_MAP_W, MINIMAP_MAP_H)
            // Dark blue tint for radar aesthetic
            bgCtx.fillStyle = 'rgba(4, 10, 26, 0.52)'
            bgCtx.fillRect(0, 0, MINIMAP_MAP_W, MINIMAP_MAP_H)
            minimapBgRef.current = bg
          }
        } catch {
          // OffscreenCanvas not supported — minimap falls back to blank bg
        }
      })
      .catch(err => console.error('[TilemapRenderer] load failed:', err))

    const collisionMap = new CollisionMap()
    collisionMapRef.current = collisionMap

    const engine = new class extends GameEngine {
      update(deltaMs: number) {
        if (disposed) return
        gameState.tick += 1
        const prevX = gameState.player.x
        const prevY = gameState.player.y
        const npcHitboxes = Object.values(gameState.npcs).map((pos) => ({
          x: pos.x + PLAYER_HITBOX.offsetX,
          y: pos.y + PLAYER_HITBOX.offsetY,
          w: PLAYER_HITBOX.w,
          h: PLAYER_HITBOX.h,
        }))
        const keysDown = getKeysDown()
        const sprintHeld = keysDown.has('ShiftLeft') || keysDown.has('ShiftRight') || keysDown.has('Shift')
        const moveInputHeld = hasMovementInput(keysDown)
        movePlayer(gameState.player, keysDown, deltaMs, collisionMap, npcHitboxes)
        let moved = Math.abs(gameState.player.x - prevX) > 0.1 || Math.abs(gameState.player.y - prevY) > 0.1
        if (!moved && moveInputHeld) {
          // Safety valve: if NPC blocking creates a deadlock ring, keep player controls responsive.
          // We still respect terrain/object collisions by keeping collisionMap enabled.
          movePlayer(gameState.player, keysDown, deltaMs, collisionMap, [])
          moved = Math.abs(gameState.player.x - prevX) > 0.1 || Math.abs(gameState.player.y - prevY) > 0.1
        }
        if (moved) {
          const currentAnimFrame = Math.floor(gameState.player.animTime / WALK_FRAME_DURATION_MS) % WALK_FRAME_COUNT
          const frameChanged = currentAnimFrame !== lastPlayerAnimFrameRef.current
          if (frameChanged) {
            lastPlayerAnimFrameRef.current = currentAnimFrame
            if (FOOTSTEP_CONTACT_FRAMES.includes(currentAnimFrame as (typeof FOOTSTEP_CONTACT_FRAMES)[number])) {
              audioSystem.playFootstep({
                character: selectedPlayerCharacterRef.current,
                movement: sprintHeld ? 'run' : 'walk',
                actorId: 'player',
              })
            }
          }
        } else {
          // Reset phase when movement stops so the next start can trigger frame-0 contact naturally.
          lastPlayerAnimFrameRef.current = -1
        }

        gameState.worldTimeMs += Math.max(deltaMs, 0)
        const deltaSec = Math.max(deltaMs / 1000, 0.0001)
        if (!npcWalkGridRef.current && collisionMapRef.current) {
          npcWalkGridRef.current = buildWalkGrid({
            worldWidth: WORLD_W,
            worldHeight: WORLD_H,
            cellSize: 32,
            spriteSizePx: PLAYER_SPRITE_SIZE_PX,
            hitbox: PLAYER_HITBOX,
            overlaps: collisionMapRef.current.overlaps.bind(collisionMapRef.current),
          })
        }
        const liveSessions = useStore.getState().sessions
        const activeNpcSessions = Object.values(liveSessions)
          .filter((session) => session.status === 'active' && gameState.npcs[session.sessionId])
        const pausedByPopup = visiblePopupSessionIdsRef.current
        const pausedLegacyFallback =
          pausedByPopup.length === 0 &&
          sessionDetailOpenRef.current &&
          selectedSessionIdRef.current
            ? [selectedSessionIdRef.current]
            : []
        const pausedByDetail = derivePausedNpcSessionIds(
          pausedByPopup.length > 0 ? pausedByPopup : pausedLegacyFallback,
        )
        const playerCx = gameState.player.x + PLAYER_SPRITE_SIZE_PX / 2
        const playerCy = gameState.player.y + PLAYER_SPRITE_SIZE_PX / 2
        const pausedSessionIds = new Set(pausedByDetail)
        for (const [sessionId, pos] of Object.entries(gameState.npcs)) {
          const npcCx = pos.x + NPC_PROXIMITY_HALF_SIZE
          const npcCy = pos.y + NPC_PROXIMITY_HALF_SIZE
          if (Math.hypot(npcCx - playerCx, npcCy - playerCy) <= NPC_PLAYER_PROXIMITY_PX) {
            pausedSessionIds.add(sessionId)
          }
        }
        const behaviorStep = stepNpcBehaviors({
          sessions: activeNpcSessions,
          positions: gameState.npcs,
          deltaMs,
          worldTimeMs: gameState.worldTimeMs,
          worldWidth: WORLD_W,
          worldHeight: WORLD_H,
          pausedSessionIds,
          runtimeBySession: npcRuntimeBySessionRef.current,
          walkGrid: npcWalkGridRef.current,
        })
        const playerHitbox = playerHitboxAt({ x: gameState.player.x, y: gameState.player.y })
        const resolvedPositions: Record<string, WorldPosition> = { ...gameState.npcs }
        const runtimeBySession: Record<string, NpcRuntimeState> = {
          ...npcRuntimeBySessionRef.current,
          ...behaviorStep.runtimeBySession,
        }
        const orderedSessionIds = Object.keys(behaviorStep.positions).sort((a, b) => a.localeCompare(b))
        for (const sessionId of orderedSessionIds) {
          const current = resolvedPositions[sessionId]
          const desired = behaviorStep.positions[sessionId]
          if (!current || !desired) continue
          const occupiedNpcHitboxes = orderedSessionIds
            .filter((id) => id !== sessionId && !!resolvedPositions[id])
            .map((id) => npcHitboxAt(resolvedPositions[id]!))
          const next = resolveNpcMovementPosition(
            current,
            desired,
            occupiedNpcHitboxes,
            playerHitbox,
            collisionMapRef.current,
          )
          resolvedPositions[sessionId] = next
        }
        for (const sessionId of orderedSessionIds) {
          const prev = gameState.npcs[sessionId]
          const next = resolvedPositions[sessionId]
          const runtime = runtimeBySession[sessionId]
          if (!next) continue
          if (!runtime) {
            gameState.npcs[sessionId] = { x: next.x, y: next.y }
            continue
          }

          const movedDistance = prev ? Math.hypot(next.x - prev.x, next.y - prev.y) : 1
          const mode = behaviorStep.modes[sessionId]

          if (mode === 'paused') {
            runtime.stuckSinceMs = 0
            runtime.lastProgressAtMs = gameState.worldTimeMs
          } else if (movedDistance >= 0.5) {
            runtime.lastProgressAtMs = gameState.worldTimeMs
            runtime.stuckSinceMs = 0
            runtime.failedReplans = 0
          } else {
            if (runtime.stuckSinceMs <= 0) {
              runtime.stuckSinceMs = gameState.worldTimeMs
            }
            const stuckDurationMs = gameState.worldTimeMs - runtime.stuckSinceMs
            if (stuckDurationMs >= NPC_STUCK_WARNING_MS) {
              runtime.path = []
              runtime.pathIndex = 0
            }

            const shouldEmergencyRecover =
              stuckDurationMs >= NPC_STUCK_HARD_FAIL_MS &&
              runtime.failedReplans >= NPC_REPLAN_FAILS_FOR_RECOVERY
            if (shouldEmergencyRecover) {
              const slotIndex = Math.abs(runtime.seed + Math.floor(gameState.worldTimeMs / 1000)) % SPAWN_SLOTS.length
              const slotTarget = SPAWN_SLOTS[slotIndex]!
              const occupiedNpcHitboxes = Object.entries(resolvedPositions)
                .filter(([id]) => id !== sessionId)
                .map(([, pos]) => npcHitboxAt(pos))
              const freePos = findNearestFreeNpcSpawnPosition(
                slotTarget,
                occupiedNpcHitboxes,
                playerHitbox,
                collisionMapRef.current,
              )
              resolvedPositions[sessionId] = freePos
              gameState.npcs[sessionId] = { x: freePos.x, y: freePos.y }
              runtime.target = null
              runtime.path = []
              runtime.pathIndex = 0
              runtime.velocity = { x: 0, y: 0 }
              runtime.failedReplans = 0
              runtime.stuckSinceMs = 0
              runtime.lastProgressAtMs = gameState.worldTimeMs
              continue
            }
          }
          gameState.npcs[sessionId] = { x: next.x, y: next.y }
        }

        for (const sessionId of Object.keys(runtimeBySession)) {
          if (!gameState.npcs[sessionId]) {
            delete runtimeBySession[sessionId]
          }
        }
        npcRuntimeBySessionRef.current = runtimeBySession

        // Update mode cache for minimap
        for (const [sessionId, runtime] of Object.entries(runtimeBySession)) {
          npcModeBySessionRef.current[sessionId] = runtime.mode
        }
        for (const id of Object.keys(npcModeBySessionRef.current)) {
          if (!gameState.npcs[id]) delete npcModeBySessionRef.current[id]
        }

        const previousNpcPositions = previousNpcPositionsRef.current
        const npcDirections = npcDirectionBySessionRef.current
        const npcAnimTimeMs = npcAnimTimeMsBySessionRef.current
        const npcMovingBySession = npcMovingBySessionRef.current
        for (const [sessionId, pos] of Object.entries(gameState.npcs)) {
          const prev = previousNpcPositions[sessionId]
          let dx = 0
          let dy = 0
          let distancePx = 0
          if (prev) {
            dx = pos.x - prev.x
            dy = pos.y - prev.y
            distancePx = Math.hypot(dx, dy)
            // Suppress footstep if distance is implausibly large — indicates a teleport jump
            // rather than natural movement (~8 tiles/frame at 60fps = ~128px max natural).
            const MAX_NATURAL_MOVE_PX = 80
            if (distancePx > 0.1 && distancePx < MAX_NATURAL_MOVE_PX) {
              const speedPxPerSec = distancePx / deltaSec
              const movement = speedPxPerSec >= PLAYER_SPEED * 1.35 ? 'run' : 'walk'
              const character = (liveSessions[sessionId]?.character ?? 'astronaut') as CharacterType
              audioSystem.playFootstep({
                character,
                movement,
                actorId: `npc:${sessionId}`,
              })
            }
          }

          const wasDirection = npcDirections[sessionId] ?? 'south'
          const isMoving = distancePx > 0.1
          npcMovingBySession[sessionId] = isMoving
          npcDirections[sessionId] = deriveDirectionFromDelta(dx, dy, wasDirection)
          npcAnimTimeMs[sessionId] = isMoving ? (npcAnimTimeMs[sessionId] ?? 0) + deltaMs : 0
          previousNpcPositions[sessionId] = { x: pos.x, y: pos.y }
        }
        for (const sessionId of Object.keys(previousNpcPositions)) {
          if (!gameState.npcs[sessionId]) {
            delete previousNpcPositions[sessionId]
            delete npcDirections[sessionId]
            delete npcAnimTimeMs[sessionId]
            delete npcMovingBySession[sessionId]
          }
        }
        const playerDirection = (gameState.player.direction in DIRECTION_ROWS
          ? gameState.player.direction
          : 'south') as Direction
        const playerState: StoredPlayerState = {
          x: gameState.player.x,
          y: gameState.player.y,
          direction: playerDirection,
        }
        const persistedState = persistedPlayerStateRef.current
        const didPlayerStateChange = !persistedState ||
          persistedState.x !== playerState.x ||
          persistedState.y !== playerState.y ||
          persistedState.direction !== playerState.direction
        if (didPlayerStateChange) {
          const now = Date.now()
          if (now - lastPlayerPersistAtRef.current >= 250) {
            writeStoredPlayerState(playerState)
            persistedPlayerStateRef.current = playerState
            lastPlayerPersistAtRef.current = now
          }
        }
        const cam = gameState.camera
        const zoom = cam.zoom  // = 2
        // Set viewportW each frame in case zoom changes (future-proof)
        cam.viewportW = canvas.width / zoom
        cam.viewportH = canvas.height / zoom
        cam.targetX = gameState.player.x + 32 - cam.viewportW / 2
        cam.targetY = gameState.player.y + 32 - cam.viewportH / 2
        updateCamera(cam, { minX: 0, minY: 0, maxX: WORLD_W, maxY: WORLD_H }, deltaMs)

        const nearestSessionId = findNearestInteractableSessionId()
        if (nearestSessionId !== interactableSessionRef.current) {
          interactableSessionRef.current = nearestSessionId
        }
        positionInteractButton(nearestSessionId)
        updateApprovalBalloons()

        const playerCenterX2 = gameState.player.x + PLAYER_SPRITE_SIZE_PX / 2
        const playerCenterY2 = gameState.player.y + PLAYER_SPRITE_SIZE_PX / 2
        const nearSwitch = Math.hypot(playerCenterX2 - EJECT_SWITCH_CENTER_X, playerCenterY2 - EJECT_SWITCH_CENTER_Y) <= EJECT_SWITCH_INTERACT_RADIUS_PX
        const nearCloset = Math.hypot(playerCenterX2 - CLOSET_CENTER_X, playerCenterY2 - CLOSET_CENTER_Y) <= CLOSET_INTERACT_RADIUS_PX
        const nearAudioDesk = Math.hypot(playerCenterX2 - AUDIO_DESK_CENTER_X, playerCenterY2 - AUDIO_DESK_CENTER_Y) <= AUDIO_DESK_INTERACT_RADIUS_PX
        ejectSwitchNearRef.current = nearSwitch
        closetNearRef.current = nearCloset
        audioDeskNearRef.current = nearAudioDesk
        positionObjectPrompt(ejectButtonAnchorRef.current, canvas, EJECT_SWITCH_CENTER_X, EJECT_SWITCH_CENTER_Y, nearSwitch)
        positionObjectPrompt(closetButtonAnchorRef.current, canvas, CLOSET_CENTER_X, CLOSET_CENTER_Y, nearCloset)
        positionObjectPrompt(audioDeskButtonAnchorRef.current, canvas, AUDIO_DESK_CENTER_X, AUDIO_DESK_CENTER_Y, nearAudioDesk)
      }
      render() {
        if (disposed) return
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        // Read sessions and events from the store snapshot (not hook — called in rAF)
        const { sessions: liveSessions, events: liveEvents } = useStore.getState()
        const zoom = gameState.camera.zoom  // = 2
        const fxPatterns = sceneFxPatternsRef.current
        if (!fxPatterns.noise) fxPatterns.noise = createNoisePattern(ctx)
        if (!fxPatterns.scanlines) fxPatterns.scanlines = createScanlinePattern(ctx)

        ctx.save()
        ctx.scale(zoom, zoom)

        // Layer 0: Tilemap (terrain + overlay + objects) — pre-rendered OffscreenCanvas
        // Bilinear smoothing preserved for the pre-rendered composite map
        ctx.imageSmoothingEnabled = true
        tilemapRenderer.blit(ctx, gameState.camera.x, gameState.camera.y)

        // Sprites use nearest-neighbor — required for pixel art sharpness at 2× zoom
        ctx.imageSmoothingEnabled = false

        // Layer 1: world-space character shadows
        Object.values(liveSessions ?? {}).forEach((session) => {
          const pos = gameState.npcs[session.sessionId]
          if (!pos) return
          drawEntityShadow(ctx, pos.x - gameState.camera.x, pos.y - gameState.camera.y, 0.95)
        })
        drawEntityShadow(
          ctx,
          gameState.player.x - gameState.camera.x,
          gameState.player.y - gameState.camera.y,
          1,
        )

        // Layer 2: depth-sorted character sprites. For this top-down scene,
        // larger Y (feet lower on screen) should render in front.
        const spriteQueue: Array<{ depth: number; priority: number; draw: () => void }> = []

        Object.values(liveSessions ?? {}).forEach((session) => {
          const pos = gameState.npcs[session.sessionId]
          if (!pos) return
          spriteQueue.push({
            depth: pos.y + PLAYER_HITBOX.offsetY + PLAYER_HITBOX.h,
            priority: 1,
            draw: () => {
              const sessionEvents = liveEvents[session.sessionId] ?? []
              const lastEvent = sessionEvents.at(-1)
              drawAgentSprite({
                ctx,
                session,
                lastEvent,
                position: { x: pos.x - gameState.camera.x, y: pos.y - gameState.camera.y },
                direction: npcDirectionBySessionRef.current[session.sessionId] ?? 'south',
                isMoving: npcMovingBySessionRef.current[session.sessionId] ?? false,
                animTimeMs: npcAnimTimeMsBySessionRef.current[session.sessionId] ?? 0,
                imageCache: imageCacheRef.current,
                tick: gameState.tick,
              })
            },
          })
        })

        const pImg = playerImgRef.current
        if (pImg?.complete && pImg.naturalWidth > 0) {
          const px = gameState.player.x - gameState.camera.x
          const py = gameState.player.y - gameState.camera.y
          const dirRow = DIRECTION_ROWS[gameState.player.direction as Direction] ?? 0
          const stateOffset = gameState.player.animTime > 0 ? STATE_ROW_OFFSET.walk : STATE_ROW_OFFSET.idle
          const row = dirRow + stateOffset
          const col = Math.floor(gameState.player.animTime / WALK_FRAME_DURATION_MS) % WALK_FRAME_COUNT
          const flashFrames = playerTeleportFlashFramesRef.current
          if (flashFrames > 0) playerTeleportFlashFramesRef.current--
          spriteQueue.push({
            depth: gameState.player.y + PLAYER_HITBOX.offsetY + PLAYER_HITBOX.h,
            // Keep player behind NPC when they share the same depth line.
            priority: 0,
            draw: () => {
              // Fade-in alpha pulse for 3 frames after teleport (0.3 → 0.7 → 1.0)
              if (flashFrames > 0) {
                ctx.globalAlpha = 0.3 + 0.7 * ((3 - flashFrames) / 3)
              }
              ctx.drawImage(pImg, col * 64, row * 64, 64, 64, px, py, 64, 64)
              ctx.globalAlpha = 1.0
            },
          })
        }

        spriteQueue
          .sort((a, b) => {
            if (a.depth !== b.depth) return a.depth - b.depth
            return a.priority - b.priority
          })
          .forEach((entry) => entry.draw())

        // Layer 4: subtle world lighting/tint
        drawWorldOverlay(ctx, gameState.camera.viewportW, gameState.camera.viewportH)

        if (import.meta.env.VITE_DEBUG_HITBOXES === 'true') {
          collisionMap.debugDraw(ctx, gameState.camera.x, gameState.camera.y)

          // Character hitboxes (blue=NPC, yellow=player)
          ctx.save()
          ctx.lineWidth = 1

          Object.values(liveSessions ?? {}).forEach((session) => {
            const pos = gameState.npcs[session.sessionId]
            if (!pos) return
            ctx.strokeStyle = 'rgba(0, 150, 255, 0.9)'
            ctx.strokeRect(
              pos.x - gameState.camera.x + PLAYER_HITBOX.offsetX,
              pos.y - gameState.camera.y + PLAYER_HITBOX.offsetY,
              PLAYER_HITBOX.w,
              PLAYER_HITBOX.h,
            )
          })

          ctx.strokeStyle = 'rgba(255, 220, 0, 0.9)'
          ctx.strokeRect(
            gameState.player.x - gameState.camera.x + PLAYER_HITBOX.offsetX,
            gameState.player.y - gameState.camera.y + PLAYER_HITBOX.offsetY,
            PLAYER_HITBOX.w,
            PLAYER_HITBOX.h,
          )
          ctx.restore()
        }

        ctx.restore()

        // Layer 5: screen-space polish (vignette + scanlines + noise)
        drawScreenOverlays(ctx, canvas.width, canvas.height, fxPatterns, gameState.tick)

        // Layer 6: minimap overlay (screen-space, drawn last so it's always on top)
        drawMiniMap({
          ctx,
          canvasW: canvas.width,
          canvasH: canvas.height,
          worldW: WORLD_W,
          worldH: WORLD_H,
          playerPos: gameState.player,
          playerImg: playerImgRef.current,
          npcPositions: gameState.npcs,
          npcModes: npcModeBySessionRef.current,
          sessions: liveSessions,
          imageCache: imageCacheRef.current,
          tilemapBg: minimapBgRef.current,
          camera: gameState.camera,
          tick: gameState.tick,
        })
      }
    }(canvas)

    engine.start()
    attachInput()

    const teardownRuntime = () => {
      if (disposed) return
      disposed = true
      const playerDirection = (gameState.player.direction in DIRECTION_ROWS
        ? gameState.player.direction
        : 'south') as Direction
      const finalPlayerState: StoredPlayerState = {
        x: gameState.player.x,
        y: gameState.player.y,
        direction: playerDirection,
      }
      writeStoredPlayerState(finalPlayerState)
      persistedPlayerStateRef.current = finalPlayerState
      engine.stop()
      detachInput()
      npcWalkGridRef.current = null
      npcRuntimeBySessionRef.current = {}
      if (collisionMapRef.current === collisionMap) {
        collisionMapRef.current = null
      }
      if (runtimeWindow?.[OFFICE_RUNTIME_TEARDOWN_KEY] === teardownRuntime) {
        delete runtimeWindow[OFFICE_RUNTIME_TEARDOWN_KEY]
      }
    }
    if (runtimeWindow) {
      runtimeWindow[OFFICE_RUNTIME_TEARDOWN_KEY] = teardownRuntime
    }

    fetch('/maps/maps-manifest.json')
      .then(r => r.json())
      .then(async (manifest: MapsManifest) => {
        if (disposed) return
        if (!Array.isArray(manifest.maps)) {
          throw new Error('Invalid maps manifest payload')
        }
        for (let i = 0; i < manifest.maps.length; i++) {
          if (disposed) return
          const entry = manifest.maps[i]
          const [terrainData, objectsData] = await Promise.all([
            fetch(`${entry.dir}/terrain-map.json`).then(r => r.json()),
            fetch(`${entry.dir}/objects/manifest.json`).then(r => r.json()),
          ])
          if (disposed) return
          const objects = (objectsData as { objects: unknown[] }).objects as Parameters<CollisionMap['loadObjects']>[0]
          const alphaBounds = await buildObjectAlphaBounds(objects, entry.dir)
          if (disposed) return
          const loadOpts = {
            tileOriginX: entry.tileOriginX,
            tileOriginY: entry.tileOriginY,
            worldOriginX: entry.worldOriginX,
            worldOriginY: entry.worldOriginY,
            append: i > 0,
          }
          collisionMap.loadTerrain(terrainData as Parameters<CollisionMap['loadTerrain']>[0], loadOpts)
          collisionMap.loadObjects(objects, alphaBounds, loadOpts)
        }

        npcWalkGridRef.current = buildWalkGrid({
          worldWidth: WORLD_W,
          worldHeight: WORLD_H,
          cellSize: 32,
          spriteSizePx: PLAYER_SPRITE_SIZE_PX,
          hitbox: PLAYER_HITBOX,
          overlaps: collisionMap.overlaps.bind(collisionMap),
        })

        const currentPlayerPos = { x: gameState.player.x, y: gameState.player.y }
        const currentPlayerHitbox = playerHitboxAt(currentPlayerPos)
        const occupiedNpcSpriteRects = Object.values(gameState.npcs).map((pos) => ({
          x: pos.x,
          y: pos.y,
          w: PLAYER_SPRITE_SIZE_PX,
          h: PLAYER_SPRITE_SIZE_PX,
        }))
        const overlapsNpcSprite = occupiedNpcSpriteRects.some((rect) =>
          rectsOverlap(playerSpriteRectAt(currentPlayerPos), rect),
        )
        const overlapsSolid = collisionMap.overlaps(
          currentPlayerHitbox.x,
          currentPlayerHitbox.y,
          currentPlayerHitbox.w,
          currentPlayerHitbox.h,
        )
        if (overlapsSolid || overlapsNpcSprite) {
          const safePlayerPos = findNearestFreeTeleportPosition(
            currentPlayerPos,
            occupiedNpcSpriteRects,
            collisionMap,
          )
          gameState.player.x = safePlayerPos.x
          gameState.player.y = safePlayerPos.y
          const playerDirection = (gameState.player.direction in DIRECTION_ROWS
            ? gameState.player.direction
            : 'south') as Direction
          const safePlayerState: StoredPlayerState = {
            x: safePlayerPos.x,
            y: safePlayerPos.y,
            direction: playerDirection,
          }
          writeStoredPlayerState(safePlayerState)
          persistedPlayerStateRef.current = safePlayerState
          lastPlayerPersistAtRef.current = Date.now()
        }

        await tilemapLoadPromise
        npcWalkGridRef.current = buildWalkGrid({
          worldWidth: WORLD_W,
          worldHeight: WORLD_H,
          cellSize: 32,
          spriteSizePx: PLAYER_SPRITE_SIZE_PX,
          hitbox: PLAYER_HITBOX,
          overlaps: collisionMap.overlaps.bind(collisionMap),
        })
      })
      .catch((err: unknown) => {
        console.error('[CollisionMap] Failed to load collision data:', err)
      })

    return teardownRuntime
  }, [])

  // ResizeObserver: keep canvas dimensions matching container
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      canvas.width = Math.round(entry.contentRect.width)
      canvas.height = Math.round(entry.contentRect.height)
      const zoom = gameState.camera.zoom  // = 2
      gameState.camera.viewportW = canvas.width / zoom
      gameState.camera.viewportH = canvas.height / zoom
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Canvas click handler — hit-test sprite positions and open popup
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    function handleClick(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect()
      const zoom = gameState.camera.zoom  // = 2
      const clickX = (e.clientX - rect.left) / zoom + gameState.camera.x
      const clickY = (e.clientY - rect.top) / zoom + gameState.camera.y

      if (clickX >= CLOSET_WORLD_X && clickX <= CLOSET_WORLD_X + 66 && clickY >= CLOSET_WORLD_Y && clickY <= CLOSET_WORLD_Y + 68) { setClosetOpen(true); return }
      if (clickX >= AUDIO_DESK_WORLD_X && clickX <= AUDIO_DESK_WORLD_X + 91 && clickY >= AUDIO_DESK_WORLD_Y && clickY <= AUDIO_DESK_WORLD_Y + 63) { setAudioOpen(true); return }
      if (clickX >= EJECT_SWITCH_WORLD_X && clickX <= EJECT_SWITCH_WORLD_X + 32 && clickY >= EJECT_SWITCH_WORLD_Y && clickY <= EJECT_SWITCH_WORLD_Y + 32) { setEjectDialogOpen(true); return }

      for (const [sessionId, pos] of Object.entries(gameState.npcs)) {
        if (
          clickX >= pos.x && clickX <= pos.x + PLAYER_SPRITE_SIZE_PX &&
          clickY >= pos.y && clickY <= pos.y + PLAYER_SPRITE_SIZE_PX
        ) {
          focusSessionInWorld(sessionId)
          openAgentChatPopup(sessionId)
          break
        }
      }
    }
    canvas.addEventListener('click', handleClick)
    return () => canvas.removeEventListener('click', handleClick)
  }, [])

  // Keyboard interaction: press E near an agent to open chat popup, or near the eject switch.
  useEffect(() => {
    function handleInteractKey(e: KeyboardEvent) {
      if (e.code !== 'KeyE' || e.repeat) return
      if (isTextInputFocused(document.activeElement)) return
      const sessionId = interactableSessionRef.current ?? findNearestInteractableSessionId()
      if (sessionId) {
        e.preventDefault()
        openAgentChatPopup(sessionId)
        return
      }
      if (closetNearRef.current) { e.preventDefault(); setClosetOpen(true); return }
      if (audioDeskNearRef.current) { e.preventDefault(); setAudioOpen(true); return }
      if (ejectSwitchNearRef.current) { e.preventDefault(); setEjectDialogOpen(true) }
    }
    window.addEventListener('keydown', handleInteractKey)
    return () => window.removeEventListener('keydown', handleInteractKey)
  }, [])

  function handleEjectConfirm(): void {
    const allSessions = Object.values(useStore.getState().sessions)
    const terminable = allSessions.filter(
      (s) => s.status === 'active' && s.canTerminateSession === true,
    )
    if (terminable.length === 0) {
      setEjectDialogOpen(false)
      return
    }
    setEjectProcessing(true)
    for (const session of terminable) {
      sendWsMessage({ type: 'session_terminate', sessionId: session.sessionId })
    }
    setEjectProcessing(false)
    setEjectDialogOpen(false)
  }

  function popupLabel(sessionId: string): string {
    const source = liveSessionsById[sessionId] ?? historySessionsById[sessionId]
    return getSessionTitle(source?.workspacePath, sessionId)
  }

  function popupCharacter(sessionId: string): CharacterType {
    const source = liveSessionsById[sessionId]
    return source?.character ?? 'astronaut'
  }

  function popupStatus(sessionId: string): 'active' | 'ended' | 'error' {
    const status = liveSessionsById[sessionId]?.status ?? historySessionsById[sessionId]?.finalStatus
    if (status === 'active' || status === 'error') return status
    return 'ended'
  }

  return (
    <>
      <div
        ref={containerRef}
        className="relative w-full h-full overflow-hidden"
        data-testid="office-canvas"
        role="region"
        aria-label="Office workspace"
        aria-describedby="office-canvas-description"
        style={{}}
      >
        <p id="office-canvas-description" className="sr-only">
          Spatial office view for active agents. Use the visible controls for agent popups, approvals, closet, audio settings, and emergency eject.
        </p>
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, zIndex: 0, imageRendering: 'pixelated' }}
          data-testid="game-canvas"
          role="img"
          aria-label="Pixel office map with agent positions"
        />
        <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
          <ApprovalBalloonOverlay balloonRefsMap={balloonRefsMap} />
          <div
            ref={interactButtonAnchorRef}
            className="absolute"
            style={{ display: 'none', transform: 'translate(4px, calc(-100% - 2px))' }}
          >
            <button
              type="button"
              className="cockpit-btn office-overlay-btn px-2.5 py-1 text-[10px] font-semibold inline-flex items-center gap-1.5"
              onClick={() => {
                const sessionId = interactableSessionRef.current ?? findNearestInteractableSessionId()
                if (!sessionId) return
                openAgentChatPopup(sessionId)
              }}
              aria-label="Interact with nearby agent"
              title="Press E to talk"
              data-testid="interact-button"
            >
              <span className="border border-border px-1 py-0.5 [font-family:var(--font-mono-data)] leading-none">E</span>
              Talk
            </button>
          </div>
          <div ref={closetButtonAnchorRef} className="absolute" style={{ display: 'none', transform: 'translate(-50%, calc(-100% - 2px))' }}>
            <button type="button" className="cockpit-btn office-overlay-btn px-2.5 py-1 text-[10px] font-semibold inline-flex items-center gap-1.5" onClick={() => setClosetOpen(true)} aria-label="Open closet">
              <span className="border border-border px-1 py-0.5 [font-family:var(--font-mono-data)] leading-none">E</span>
              Open Closet
            </button>
          </div>
          <div ref={audioDeskButtonAnchorRef} className="absolute" style={{ display: 'none', transform: 'translate(-50%, calc(-100% - 2px))' }}>
            <button type="button" className="cockpit-btn office-overlay-btn px-2.5 py-1 text-[10px] font-semibold inline-flex items-center gap-1.5" onClick={() => setAudioOpen(true)} aria-label="Open audio settings">
              <span className="border border-border px-1 py-0.5 [font-family:var(--font-mono-data)] leading-none">E</span>
              Audio Settings
            </button>
          </div>
          <div ref={ejectButtonAnchorRef} className="absolute" style={{ display: 'none', transform: 'translate(-50%, calc(-100% - 2px))' }}>
            <button type="button" className="cockpit-btn office-overlay-btn px-2.5 py-1 text-[10px] font-semibold inline-flex items-center gap-1.5 border-red-500/60 text-red-300" onClick={() => setEjectDialogOpen(true)} aria-label="Emergency eject all sessions">
              <span className="border border-red-500/60 px-1 py-0.5 [font-family:var(--font-mono-data)] leading-none">E</span>
              Eject
            </button>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 z-30">
          {orderedPopupSessionIds.map((sessionId, orderIndex) => {
            const popup = popupWindows[sessionId]
            if (!popup || popup.minimized) return null
            const zIndex = 70 + orderIndex
            return (
              <div
                key={sessionId}
                className="pointer-events-auto absolute overflow-hidden"
                style={{
                  left: popup.x,
                  top: popup.y,
                  width: popup.width,
                  height: popup.height,
                  zIndex,
                }}
                onMouseDown={() => bringSessionPopupToFront(sessionId)}
                data-testid={`popup-window-${sessionId}`}
              >
                <div
                  className="absolute inset-x-0 top-0 z-40 h-2 cursor-move"
                  onPointerDown={(event) => {
                    event.preventDefault()
                    startPopupGesture(
                      'move',
                      sessionId,
                      event.pointerId,
                      event.clientX,
                      event.clientY,
                    )
                  }}
                />
                <InstancePopupHub
                  inline
                  open={true}
                  sessionId={sessionId}
                  preferredTab={popup.preferredTab}
                  onPreferredTabConsumed={() => clearSessionPopupPreferredTab(sessionId)}
                  onClose={() => closeSessionPopup(sessionId)}
                  onMinimize={() => minimizeSessionPopup(sessionId)}
                  onFocus={() => bringSessionPopupToFront(sessionId)}
                />
                <button
                  type="button"
                  className="absolute bottom-0 right-0 z-40 h-5 w-5 cursor-nwse-resize border-l border-t border-border/70 bg-[color-mix(in_srgb,var(--color-cockpit-accent)_10%,transparent)] text-[10px] text-muted-foreground"
                  aria-label={`Resize popup ${popupLabel(sessionId)}`}
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    startPopupGesture(
                      'resize',
                      sessionId,
                      event.pointerId,
                      event.clientX,
                      event.clientY,
                    )
                  }}
                >
                  ◢
                </button>
              </div>
            )
          })}
          {orderedPopupSessionIds.length > 0 && (
            <div
              className="pointer-events-auto absolute bottom-2 left-1/2 -translate-x-1/2"
              data-testid="popup-dock-bar"
            >
              <div className="cockpit-frame-full flex max-w-[min(92vw,1120px)] items-center gap-2 overflow-x-auto border border-[color-mix(in_srgb,var(--color-cockpit-accent)_35%,var(--color-border))] bg-[linear-gradient(180deg,oklch(0.18_0.03_252)_0%,oklch(0.16_0.03_252)_100%)] px-3 py-1.5">
                <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
                <span className="cockpit-corner cockpit-corner-tr" aria-hidden />
                <span className="shrink-0 [font-family:var(--font-mono-data)] text-[9px] uppercase tracking-[0.16em] text-[var(--color-cockpit-dim)] pr-1 select-none">
                  Open Agents
                </span>
                <span className="shrink-0 w-px h-4 bg-border/50" aria-hidden />
                {orderedPopupSessionIds.map((sessionId) => {
                  const popup = popupWindows[sessionId]
                  if (!popup) return null
                  const minimized = popup.minimized
                  const focused = selectedSessionId === sessionId && !minimized
                  const status = popupStatus(sessionId)
                  return (
                    <div key={sessionId} className="flex shrink-0 items-center">
                      <button
                        type="button"
                        className={`flex items-center gap-1.5 border px-2 py-1 [font-family:var(--font-mono-data)] text-[10px] uppercase tracking-[0.12em] transition-colors ${
                          focused
                            ? 'border-[#c87941] bg-[color-mix(in_srgb,#c87941_12%,transparent)] text-[#e8a96a]'
                            : minimized
                              ? 'border-[#6b6ab0] bg-[color-mix(in_srgb,#6b6ab0_10%,transparent)] text-muted-foreground hover:text-foreground hover:border-[#8b8ad0]'
                              : 'border-[#6b6ab0] bg-[color-mix(in_srgb,#6b6ab0_10%,transparent)] text-foreground hover:border-[#8b8ad0]'
                        }`}
                        onClick={() => {
                          if (minimized) {
                            restoreSessionPopup(sessionId)
                            return
                          }
                          bringSessionPopupToFront(sessionId)
                        }}
                        data-testid={`popup-dock-${sessionId}`}
                        aria-label={`${minimized ? 'Restore' : 'Focus'} ${popupLabel(sessionId)} popup. Status: ${status}.`}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${POPUP_DOCK_STATUS_DOT[status]}`}
                          aria-hidden
                          data-testid={`popup-dock-status-${sessionId}`}
                          data-status={status}
                        />
                        <PopupDockAvatar
                          character={popupCharacter(sessionId)}
                          label={popupLabel(sessionId)}
                        />
                        <span className="truncate max-w-40">{popupLabel(sessionId)}</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      <ClosetPopup open={closetOpen} onClose={() => setClosetOpen(false)} />
      <MenuPopup open={audioOpen} onClose={() => setAudioOpen(false)} />
      <EjectAllSessionsDialog
        open={ejectDialogOpen}
        sessionCount={sessions.filter((s) => s.status === 'active' && s.canTerminateSession === true).length}
        isProcessing={ejectProcessing}
        onCancel={() => setEjectDialogOpen(false)}
        onConfirm={handleEjectConfirm}
      />
    </>
  )
}
