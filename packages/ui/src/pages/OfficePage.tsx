// DnD removed in Phase 15-03. Positions are owned by gameState.npcs. Zone assignment in Phase 17.

import { useRef, useEffect, useState } from 'react'
import { useStore } from '../store/index.js'
import { useActiveSessions } from '../store/selectors.js'
import { audioSystem } from '../audio/audioSystem.js'
import { InstancePopupHub } from '../components/office/InstancePopupHub.js'
import { MenuPopup } from '../components/office/MenuPopup.js'
import { ApprovalBalloonOverlay } from '../components/office/ApprovalBalloonOverlay.js'
import { drawAgentSprite } from '../components/office/AgentSprite.js'
import { DIRECTION_ROWS, STATE_ROW_OFFSET } from '../components/office/spriteStates.js'
import type { Direction } from '../components/office/spriteStates.js'
import { GameEngine } from '../game/GameEngine.js'
import { gameState, setWorldBounds, WORLD_W, WORLD_H } from '../game/GameState.js'
import { updateCamera } from '../game/Camera.js'
import { attachInput, detachInput, getKeysDown, movePlayer, WALK_FRAME_DURATION_MS, WALK_FRAME_COUNT } from '../game/PlayerInput.js'
import { TilemapRenderer, type MapsManifest } from '../game/TilemapRenderer.js'
import { CollisionMap, PLAYER_HITBOX } from '../game/CollisionMap.js'

// Module-level sidebar focus callback for MapSidebar compatibility.
let _scrollToSession: ((id: string) => void) | null = null
export function scrollToSession(id: string) { _scrollToSession?.(id) }

type MapObject = Parameters<CollisionMap['loadObjects']>[0][number]
type ObjectAlphaBoundsMap = Parameters<CollisionMap['loadObjects']>[1]
interface SceneFxPatterns {
  noise: CanvasPattern | null
  scanlines: CanvasPattern | null
}

/** Verified walkable spawn positions for NPC agents (world pixel coords).
 * Slots are validated against terrain + object collisions using PLAYER_HITBOX.
 * Coordinates stay on open floor around map center to avoid wall/object edge spawns.
 */
const SPAWN_SLOTS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 1984, y: 1888 }, { x: 2048, y: 1888 }, { x: 2112, y: 1888 }, { x: 2176, y: 1888 },
  { x: 2016, y: 1920 }, { x: 2080, y: 1920 }, { x: 2144, y: 1920 },
  { x: 1952, y: 1952 }, { x: 2016, y: 1952 },
  { x: 1920, y: 2112 }, { x: 1984, y: 2112 }, { x: 2048, y: 2112 },
] as const

/** Pixel offset applied per cycle to prevent exact NPC stacking when sessions > 12. */
const SPAWN_JITTER = 16
const SPRITE_SIZE = 42
const INTERACT_RADIUS_PX = 64
const NPC_POSITION_STORAGE_KEY = 'cockpit.npc.positions.v1'
const PLAYER_STATE_STORAGE_KEY = 'cockpit.player.state.v1'

interface WorldPosition {
  x: number
  y: number
}

type StoredNpcPositions = Record<string, WorldPosition>
type StoredPlayerState = WorldPosition & { direction: Direction }

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

export function OfficePage() {
  const sessions = useActiveSessions()
  const sessionDetailOpen = useStore((s) => s.sessionDetailOpen)
  const selectedPlayerCharacter = useStore((s) => s.selectedPlayerCharacter)
  const setSessionDetailOpen = useStore((s) => s.setSessionDetailOpen)
  const setPopupPreferredTab = useStore((s) => s.setPopupPreferredTab)
  const [menuOpen, setMenuOpen] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const playerImgRef = useRef<HTMLImageElement | null>(null)
  const sceneFxPatternsRef = useRef<SceneFxPatterns>({ noise: null, scanlines: null })
  const interactableSessionRef = useRef<string | null>(null)
  const interactButtonAnchorRef = useRef<HTMLDivElement | null>(null)
  const balloonRefsMap = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const persistedNpcPositionsRef = useRef<StoredNpcPositions>(readStoredNpcPositions())
  const persistedPlayerStateRef = useRef<StoredPlayerState | null>(null)
  const lastPlayerPersistAtRef = useRef<number>(0)

  function findNearestInteractableSessionId(): string | null {
    const playerCenterX = gameState.player.x + SPRITE_SIZE / 2
    const playerCenterY = gameState.player.y + SPRITE_SIZE / 2
    const maxDistanceSq = INTERACT_RADIUS_PX * INTERACT_RADIUS_PX
    let closestId: string | null = null
    let closestDistanceSq = Number.POSITIVE_INFINITY

    for (const [sessionId, pos] of Object.entries(gameState.npcs)) {
      const npcCenterX = pos.x + SPRITE_SIZE / 2
      const npcCenterY = pos.y + SPRITE_SIZE / 2
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
    // Teleport player AND camera to centre on clicked NPC (instant — no lerp)
    // Player position must also move so update()'s cam.targetX = player.x - vw/2 keeps
    // the camera centred here on the next tick (otherwise update() overwrites targetX).
    gameState.player.x = pos.x
    gameState.player.y = pos.y
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
    const screenX = (pos.x - gameState.camera.x + SPRITE_SIZE) * zoom
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
      const screenX = (pos.x - gameState.camera.x + SPRITE_SIZE / 2) * zoom
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
    const playerImg = new Image()
    playerImg.src = `/sprites/${selectedPlayerCharacter}-sheet.png`
    playerImgRef.current = playerImg
  }, [selectedPlayerCharacter])

  useEffect(() => {
    const persisted = readStoredPlayerState()
    if (!persisted) return
    gameState.player.x = persisted.x
    gameState.player.y = persisted.y
    gameState.player.direction = persisted.direction
    persistedPlayerStateRef.current = persisted
  }, [])

  // Seed gameState.npcs from sessions — assign walkable spawn slot on first appearance only.
  // Positions are persisted by sessionId so reload/rerender keeps the same world location.
  useEffect(() => {
    const persistedNpcPositions = persistedNpcPositionsRef.current
    let didMutatePersistedPositions = false

    sessions.forEach((session, i) => {
      if (!gameState.npcs[session.sessionId]) {
        const persisted = persistedNpcPositions[session.sessionId]
        if (persisted) {
          gameState.npcs[session.sessionId] = { x: persisted.x, y: persisted.y }
          return
        }
        const slot = SPAWN_SLOTS[i % SPAWN_SLOTS.length]
        const cycle = Math.floor(i / SPAWN_SLOTS.length)
        const seededPos = {
          x: slot.x + (cycle > 0 ? (cycle % 3) * SPAWN_JITTER : 0),
          y: slot.y + (cycle > 0 ? Math.floor(cycle / 3) * SPAWN_JITTER : 0),
        }
        gameState.npcs[session.sessionId] = seededPos
        persistedNpcPositions[session.sessionId] = seededPos
        didMutatePersistedPositions = true
      }
    })

    // Clean up sessions that ended
    const activeIds = new Set(sessions.map(s => s.sessionId))
    Object.keys(gameState.npcs).forEach(id => {
      if (!activeIds.has(id)) {
        delete gameState.npcs[id]
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
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) { console.error('[GameEngine] canvas 2d context unavailable'); return }

    const tilemapRenderer = new TilemapRenderer()
    // Load map assets before starting engine (non-blocking: engine starts after assets ready)
    const tilemapLoadPromise = tilemapRenderer
      .load()
      .then(() => {
        setWorldBounds(tilemapRenderer.worldW || 3232, tilemapRenderer.worldH || 3232)
      })
      .catch(err => console.error('[TilemapRenderer] load failed:', err))

    const collisionMap = new CollisionMap()

    const engine = new class extends GameEngine {
      update(deltaMs: number) {
        gameState.tick += 1
        const prevX = gameState.player.x
        const prevY = gameState.player.y
        const npcHitboxes = Object.values(gameState.npcs).map((pos) => ({
          x: pos.x + PLAYER_HITBOX.offsetX,
          y: pos.y + PLAYER_HITBOX.offsetY,
          w: PLAYER_HITBOX.w,
          h: PLAYER_HITBOX.h,
        }))
        movePlayer(gameState.player, getKeysDown(), deltaMs, collisionMap, npcHitboxes)
        const moved = Math.abs(gameState.player.x - prevX) > 0.1 || Math.abs(gameState.player.y - prevY) > 0.1
        if (moved) {
          audioSystem.playFootstep()
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
      }
      render() {
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

        // Layer 2: NPC sprites (existing code, coordinates unchanged)
        Object.values(liveSessions ?? {}).forEach((session) => {
          const pos = gameState.npcs[session.sessionId]
          if (!pos) return
          const sessionEvents = liveEvents[session.sessionId] ?? []
          const lastEvent = sessionEvents.at(-1)
          drawAgentSprite({
            ctx,
            session,
            lastEvent,
            position: { x: pos.x - gameState.camera.x, y: pos.y - gameState.camera.y },
            imageCache: imageCacheRef.current,
            tick: gameState.tick,
          })
        })

        // Layer 3: Player sprite (existing code, coordinates unchanged)
        const pImg = playerImgRef.current
        if (pImg?.complete && pImg.naturalWidth > 0) {
          const px = gameState.player.x - gameState.camera.x
          const py = gameState.player.y - gameState.camera.y
          const dirRow = DIRECTION_ROWS[gameState.player.direction as Direction] ?? 0
          const stateOffset = gameState.player.animTime > 0 ? STATE_ROW_OFFSET.walk : STATE_ROW_OFFSET.idle
          const row = dirRow + stateOffset
          const col = Math.floor(gameState.player.animTime / WALK_FRAME_DURATION_MS) % WALK_FRAME_COUNT
          ctx.drawImage(pImg, col * 64, row * 64, 64, 64, px, py, 64, 64)
        }

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
      }
    }(canvas)

    engine.start()
    attachInput()

    fetch('/maps/maps-manifest.json')
      .then(r => r.json())
      .then(async (manifest: MapsManifest) => {
        if (!Array.isArray(manifest.maps)) {
          throw new Error('Invalid maps manifest payload')
        }
        for (let i = 0; i < manifest.maps.length; i++) {
          const entry = manifest.maps[i]
          const [terrainData, objectsData] = await Promise.all([
            fetch(`${entry.dir}/terrain-map.json`).then(r => r.json()),
            fetch(`${entry.dir}/objects/manifest.json`).then(r => r.json()),
          ])
          const objects = (objectsData as { objects: unknown[] }).objects as Parameters<CollisionMap['loadObjects']>[0]
          const alphaBounds = await buildObjectAlphaBounds(objects, entry.dir)
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
        await tilemapLoadPromise
      })
      .catch((err: unknown) => {
        console.error('[CollisionMap] Failed to load collision data:', err)
      })

    return () => {
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
    }
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
      for (const [sessionId, pos] of Object.entries(gameState.npcs)) {
        if (
          clickX >= pos.x && clickX <= pos.x + SPRITE_SIZE &&
          clickY >= pos.y && clickY <= pos.y + SPRITE_SIZE
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

  // Keyboard interaction: press E near an agent to open chat popup.
  useEffect(() => {
    function handleInteractKey(e: KeyboardEvent) {
      if (e.code !== 'KeyE' || e.repeat) return
      if (isTextInputFocused(document.activeElement)) return
      const sessionId = interactableSessionRef.current ?? findNearestInteractableSessionId()
      if (!sessionId) return
      e.preventDefault()
      openAgentChatPopup(sessionId)
    }
    window.addEventListener('keydown', handleInteractKey)
    return () => window.removeEventListener('keydown', handleInteractKey)
  }, [])

  return (
    <>
      <div
        ref={containerRef}
        className="relative w-full h-full overflow-hidden"
        data-testid="office-canvas"
        style={{}}
      >
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, zIndex: 0, imageRendering: 'pixelated' }}
          data-testid="game-canvas"
        />
        <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
          <div className="absolute top-3 right-3">
            <button
              type="button"
              className="cockpit-btn office-overlay-btn px-3 py-1.5 text-[11px] font-semibold"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              Menu
            </button>
          </div>
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
        </div>
      </div>
      <InstancePopupHub open={sessionDetailOpen} onClose={() => setSessionDetailOpen?.(false)} />
      <MenuPopup open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  )
}
