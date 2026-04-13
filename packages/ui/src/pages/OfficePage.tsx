// DnD removed in Phase 15-03. Positions are owned by gameState.npcs. Zone assignment in Phase 17.

import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/index.js'
import { useActiveSessions } from '../store/selectors.js'
import { InstancePopupHub } from '../components/office/InstancePopupHub.js'
import { drawAgentSprite } from '../components/office/AgentSprite.js'
import { DIRECTION_ROWS, STATE_ROW_OFFSET } from '../components/office/spriteStates.js'
import type { Direction } from '../components/office/spriteStates.js'
import { GameEngine } from '../game/GameEngine.js'
import { gameState, WORLD_W, WORLD_H } from '../game/GameState.js'
import { updateCamera } from '../game/Camera.js'
import { attachInput, detachInput, getKeysDown, movePlayer, WALK_FRAME_DURATION_MS, WALK_FRAME_COUNT } from '../game/PlayerInput.js'
import { TilemapRenderer } from '../game/TilemapRenderer.js'

// Module-level scroll singleton — kept as no-op for MapSidebar compatibility
let _scrollToSession: ((id: string) => void) | null = null
export function scrollToSession(id: string) { _scrollToSession?.(id) }

export function OfficePage() {
  const sessions = useActiveSessions()
  const [popupOpen, setPopupOpen] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const playerImgRef = useRef<HTMLImageElement | null>(null)

  // Register scroll callback (no-op — DnD scroll removed, kept for MapSidebar compatibility)
  useEffect(() => {
    _scrollToSession = (_id: string) => {}
    return () => { _scrollToSession = null }
  }, [])

  // Seed gameState.npcs from sessions
  useEffect(() => {
    const CELL = 96
    const COLS = 5
    sessions.forEach((session, i) => {
      if (!gameState.npcs[session.sessionId]) {
        gameState.npcs[session.sessionId] = {
          x: (i % COLS) * CELL,
          y: Math.floor(i / COLS) * CELL,
        }
      }
    })
    // Clean up sessions that ended
    const activeIds = new Set(sessions.map(s => s.sessionId))
    Object.keys(gameState.npcs).forEach(id => {
      if (!activeIds.has(id)) delete gameState.npcs[id]
    })
  }, [sessions])

  // Game engine lifecycle: start on mount, stop on cleanup
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) { console.error('[GameEngine] canvas 2d context unavailable'); return }

    const playerImg = new Image()
    playerImg.src = '/sprites/astronaut-sheet.png'
    playerImgRef.current = playerImg

    const tilemapRenderer = new TilemapRenderer()
    // Load map assets before starting engine (non-blocking: engine starts after assets ready)
    tilemapRenderer.load().catch(err => console.error('[TilemapRenderer] load failed:', err))

    const engine = new class extends GameEngine {
      update(deltaMs: number) {
        gameState.tick += 1
        movePlayer(gameState.player, getKeysDown(), deltaMs)
        const cam = gameState.camera
        const zoom = cam.zoom  // = 2
        // Set viewportW each frame in case zoom changes (future-proof)
        cam.viewportW = canvas.width / zoom
        cam.viewportH = canvas.height / zoom
        cam.targetX = gameState.player.x - cam.viewportW / 2
        cam.targetY = gameState.player.y - cam.viewportH / 2
        updateCamera(cam, { minX: 0, minY: 0, maxX: WORLD_W, maxY: WORLD_H }, deltaMs)
      }
      render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        // Read sessions and events from the store snapshot (not hook — called in rAF)
        const { sessions: liveSessions, events: liveEvents } = useStore.getState()
        const zoom = gameState.camera.zoom  // = 2

        ctx.save()
        ctx.scale(zoom, zoom)

        // Layer 0: Tilemap (terrain + overlay + objects) — pre-rendered OffscreenCanvas
        // Bilinear smoothing preserved for the pre-rendered composite map
        ctx.imageSmoothingEnabled = true
        tilemapRenderer.blit(ctx, gameState.camera.x, gameState.camera.y)

        // Sprites use nearest-neighbor — required for pixel art sharpness at 2× zoom
        ctx.imageSmoothingEnabled = false

        // Layer 1: NPC sprites (existing code, coordinates unchanged)
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

        // Layer 2: Player sprite (existing code, coordinates unchanged)
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

        ctx.restore()
      }
    }(canvas)

    engine.start()
    attachInput()
    return () => {
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
      const SPRITE_SIZE = 64
      for (const [sessionId, pos] of Object.entries(gameState.npcs)) {
        if (
          clickX >= pos.x && clickX <= pos.x + SPRITE_SIZE &&
          clickY >= pos.y && clickY <= pos.y + SPRITE_SIZE
        ) {
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
          useStore.getState().selectSession(sessionId)
          useStore.getState().setHistoryMode?.(false)
          setPopupOpen(true)
          break
        }
      }
    }
    canvas.addEventListener('click', handleClick)
    return () => canvas.removeEventListener('click', handleClick)
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
          {/* React UI overlays rendered here in future phases */}
        </div>
      </div>
      <InstancePopupHub open={popupOpen} onClose={() => setPopupOpen(false)} />
    </>
  )
}
