// MiniMap — TACMAP cockpit radar overlay
// Renders a tactical minimap in the bottom-right corner of the office canvas.
// Uses the pre-rendered tilemap background and agent sprite thumbnails.

// Geometry constants (exported so OfficePage can pre-render the bg at exact size)
export const MINIMAP_SIZE   = 196
export const MINIMAP_MARGIN = 12
export const MINIMAP_PAD    = 5
export const MINIMAP_HDR_H  = 13  // height of "TACMAP" header strip
export const MINIMAP_SEP    = 1   // px separator between header and map
export const MINIMAP_MAP_X  = MINIMAP_PAD
export const MINIMAP_MAP_Y  = MINIMAP_PAD + MINIMAP_HDR_H + MINIMAP_SEP
export const MINIMAP_MAP_W  = MINIMAP_SIZE - MINIMAP_PAD * 2
export const MINIMAP_MAP_H  = MINIMAP_SIZE - MINIMAP_PAD - MINIMAP_MAP_Y

// How much to zoom into the map. 1 = full world, 4 = show 1/4 of world width/height
// centered on the player. Increase for a tighter local view.
const MINIMAP_ZOOM = 3

// Sprite source: idle-south frame = row 0, col 0 of each character sheet
const SPRITE_SRC_X = 0
const SPRITE_SRC_Y = 0
const SPRITE_SRC_W = 64
const SPRITE_SRC_H = 64

const AGENT_DOT  = 9   // radius (screen px) for NPC avatar circles
const PLAYER_DOT = 10  // radius for player avatar circle

// Cockpit color tokens
const COLOR_BG         = 'rgba(5, 10, 22, 0.93)'
const COLOR_BORDER     = 'rgba(50, 160, 200, 0.55)'
const COLOR_BRACKET    = 'rgba(50, 200, 230, 0.80)'
const COLOR_HDR_TEXT   = 'rgba(50, 200, 230, 0.75)'
const COLOR_SEP        = 'rgba(50, 160, 200, 0.25)'
const COLOR_VIEWPORT   = 'rgba(90, 200, 240, 0.18)'
const COLOR_VIEWPORT_S = 'rgba(90, 200, 240, 0.55)'
const COLOR_WANDER     = '#3ab4f5'
const COLOR_ATTENTION  = '#ffaa1e'
const COLOR_PAUSED     = '#666880'
const COLOR_PLAYER_RING = '#ffffff'

interface MiniSession {
  character?: string
  sessionId?: string
}

export interface MiniMapDrawParams {
  ctx: CanvasRenderingContext2D
  canvasW: number
  canvasH: number
  worldW: number
  worldH: number
  playerPos: { x: number; y: number }
  playerImg: HTMLImageElement | null
  npcPositions: Record<string, { x: number; y: number }>
  npcModes: Record<string, string>
  sessions: Record<string, MiniSession | unknown>
  imageCache: Map<string, HTMLImageElement>
  tilemapBg: OffscreenCanvas | null
  camera: { x: number; y: number; viewportW: number; viewportH: number }
  tick: number
}

interface Viewport { left: number; top: number; w: number; h: number }

function getViewport(playerPos: { x: number; y: number }, worldW: number, worldH: number): Viewport {
  const vw = worldW / MINIMAP_ZOOM
  const vh = worldH / MINIMAP_ZOOM
  const left = Math.max(0, Math.min(playerPos.x + 32 - vw / 2, worldW - vw))
  const top  = Math.max(0, Math.min(playerPos.y + 32 - vh / 2, worldH - vh))
  return { left, top, w: vw, h: vh }
}

function worldToMap(wx: number, wy: number, vp: Viewport): { x: number; y: number } {
  return {
    x: MINIMAP_MAP_X + ((wx - vp.left) / vp.w) * MINIMAP_MAP_W,
    y: MINIMAP_MAP_Y + ((wy - vp.top)  / vp.h) * MINIMAP_MAP_H,
  }
}

function drawCornerBrackets(ctx: CanvasRenderingContext2D): void {
  const L = 10 // bracket arm length
  const R = 0  // corner offset from edge
  ctx.strokeStyle = COLOR_BRACKET
  ctx.lineWidth = 1.5
  ctx.lineCap = 'square'
  ctx.beginPath()
  // top-left
  ctx.moveTo(R, R + L); ctx.lineTo(R, R); ctx.lineTo(R + L, R)
  // top-right
  ctx.moveTo(MINIMAP_SIZE - R - L, R); ctx.lineTo(MINIMAP_SIZE - R, R); ctx.lineTo(MINIMAP_SIZE - R, R + L)
  // bottom-left
  ctx.moveTo(R, MINIMAP_SIZE - R - L); ctx.lineTo(R, MINIMAP_SIZE - R); ctx.lineTo(R + L, MINIMAP_SIZE - R)
  // bottom-right
  ctx.moveTo(MINIMAP_SIZE - R - L, MINIMAP_SIZE - R); ctx.lineTo(MINIMAP_SIZE - R, MINIMAP_SIZE - R); ctx.lineTo(MINIMAP_SIZE - R, MINIMAP_SIZE - R - L)
  ctx.stroke()
}

function drawSpriteAvatar(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null | undefined,
  cx: number,
  cy: number,
  radius: number,
  ringColor: string,
  ringAlpha = 1,
  glowColor?: string,
): void {
  ctx.save()

  // Glow ring for attention mode
  if (glowColor) {
    ctx.beginPath()
    ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2)
    ctx.strokeStyle = glowColor
    ctx.lineWidth = 2.5
    ctx.globalAlpha = ringAlpha * 0.7
    ctx.stroke()
  }

  // Clip to circle
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.clip()

  // Draw sprite or fallback fill
  ctx.globalAlpha = 1
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, SPRITE_SRC_X, SPRITE_SRC_Y, SPRITE_SRC_W, SPRITE_SRC_H, cx - radius, cy - radius, radius * 2, radius * 2)
  } else {
    // Fallback: solid circle when sprite not loaded yet
    ctx.fillStyle = ringColor
    ctx.globalAlpha = 0.5
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)
    ctx.globalAlpha = 1
  }

  ctx.restore()

  // Ring border (drawn outside clip so it frames the sprite)
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.strokeStyle = ringColor
  ctx.lineWidth = 1.5
  ctx.globalAlpha = ringAlpha
  ctx.stroke()
  ctx.globalAlpha = 1
}

export function drawMiniMap(params: MiniMapDrawParams): void {
  const {
    ctx, canvasW, canvasH, worldW, worldH,
    playerPos, playerImg,
    npcPositions, npcModes, sessions, imageCache,
    tilemapBg, camera, tick,
  } = params

  if (worldW === 0 || worldH === 0) return

  // Player-centered viewport in world space
  const vp = getViewport(playerPos, worldW, worldH)

  const ox = canvasW - MINIMAP_SIZE - MINIMAP_MARGIN
  const oy = canvasH - MINIMAP_SIZE - MINIMAP_MARGIN

  ctx.save()
  ctx.translate(ox, oy)

  // ── Background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = COLOR_BG
  ctx.beginPath()
  ctx.roundRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE, 3)
  ctx.fill()

  // ── Header: "TACMAP" label ──────────────────────────────────────────────────
  ctx.fillStyle = COLOR_HDR_TEXT
  ctx.font = '7px "Press Start 2P", "VT323", monospace'
  ctx.textBaseline = 'middle'
  ctx.imageSmoothingEnabled = false
  ctx.fillText('TACMAP', MINIMAP_PAD + 2, MINIMAP_PAD + MINIMAP_HDR_H / 2)

  // Separator line under header
  ctx.strokeStyle = COLOR_SEP
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(MINIMAP_PAD, MINIMAP_PAD + MINIMAP_HDR_H)
  ctx.lineTo(MINIMAP_SIZE - MINIMAP_PAD, MINIMAP_PAD + MINIMAP_HDR_H)
  ctx.stroke()

  // ── Map area clip ───────────────────────────────────────────────────────────
  ctx.save()
  ctx.beginPath()
  ctx.rect(MINIMAP_MAP_X, MINIMAP_MAP_Y, MINIMAP_MAP_W, MINIMAP_MAP_H)
  ctx.clip()

  // Tilemap background — crop the pre-rendered full-world image to the zoomed viewport
  if (tilemapBg) {
    const srcX = (vp.left / worldW) * MINIMAP_MAP_W
    const srcY = (vp.top  / worldH) * MINIMAP_MAP_H
    const srcW = (vp.w    / worldW) * MINIMAP_MAP_W
    const srcH = (vp.h    / worldH) * MINIMAP_MAP_H
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(tilemapBg, srcX, srcY, srcW, srcH, MINIMAP_MAP_X, MINIMAP_MAP_Y, MINIMAP_MAP_W, MINIMAP_MAP_H)
  } else {
    ctx.fillStyle = 'rgba(10, 20, 40, 1)'
    ctx.fillRect(MINIMAP_MAP_X, MINIMAP_MAP_Y, MINIMAP_MAP_W, MINIMAP_MAP_H)
  }

  // Scanline overlay for CRT radar feel
  for (let sy = MINIMAP_MAP_Y; sy < MINIMAP_MAP_Y + MINIMAP_MAP_H; sy += 3) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
    ctx.fillRect(MINIMAP_MAP_X, sy, MINIMAP_MAP_W, 1)
  }

  // ── Camera viewport rect ─────────────────────────────────────────────────────
  // const vx = MINIMAP_MAP_X + ((camera.x - vp.left) / vp.w) * MINIMAP_MAP_W
  // const vy = MINIMAP_MAP_Y + ((camera.y - vp.top)  / vp.h) * MINIMAP_MAP_H
  // const vw = (camera.viewportW / vp.w) * MINIMAP_MAP_W
  // const vh = (camera.viewportH / vp.h) * MINIMAP_MAP_H
  // ctx.fillStyle = COLOR_VIEWPORT
  // ctx.fillRect(vx, vy, vw, vh)
  // ctx.strokeStyle = COLOR_VIEWPORT_S
  // ctx.lineWidth = 0.75
  // ctx.setLineDash([2, 2])
  // ctx.strokeRect(vx, vy, vw, vh)
  // ctx.setLineDash([])

  // ── NPC avatars ──────────────────────────────────────────────────────────────
  for (const [sessionId, pos] of Object.entries(npcPositions)) {
    const mode = npcModes[sessionId] ?? 'wander'
    const session = sessions[sessionId] as MiniSession | undefined
    const character = (session as MiniSession | undefined)?.character ?? 'astronaut'
    const spriteImg = imageCache.get(`/sprites/${character}-sheet.png`)

    const { x: mx, y: my } = worldToMap(pos.x + 32, pos.y + 32, vp)

    let ringColor: string
    let glowColor: string | undefined
    let ringAlpha = 1

    if (mode === 'attention') {
      const pulse = (Math.sin(tick * 0.18) + 1) / 2  // 0..1
      ringColor = COLOR_ATTENTION
      glowColor = COLOR_ATTENTION
      ringAlpha = 0.7 + pulse * 0.3
    } else if (mode === 'paused') {
      ringColor = COLOR_PAUSED
      ringAlpha = 0.65
    } else {
      ringColor = COLOR_WANDER
    }

    drawSpriteAvatar(ctx, spriteImg, mx, my, AGENT_DOT, ringColor, ringAlpha, glowColor)
  }

  // ── Player avatar ────────────────────────────────────────────────────────────
  const { x: px, y: py } = worldToMap(playerPos.x + 32, playerPos.y + 32, vp)

  // White pulse ring behind player
  const playerPulse = (Math.sin(tick * 0.08) + 1) / 2
  ctx.beginPath()
  ctx.arc(px, py, PLAYER_DOT + 4, 0, Math.PI * 2)
  ctx.strokeStyle = COLOR_PLAYER_RING
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.15 + playerPulse * 0.1
  ctx.stroke()
  ctx.globalAlpha = 1

  drawSpriteAvatar(ctx, playerImg, px, py, PLAYER_DOT, COLOR_PLAYER_RING, 1)

  ctx.restore()  // end map area clip

  // ── Outer border + corner brackets ──────────────────────────────────────────
  ctx.strokeStyle = COLOR_BORDER
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE, 3)
  ctx.stroke()

  drawCornerBrackets(ctx)

  ctx.restore()  // end translate
}
