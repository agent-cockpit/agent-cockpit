// DnD removed in Phase 15-03. AgentSprite is now a pure canvas draw utility.
// The React component is gone. Positions are owned by gameState.npcs. Zone assignment in Phase 17.

import type { NormalizedEvent } from '@cockpit/shared'
import type { SessionRecord } from '../../store/index.js'
import {
  STATE_ROW_OFFSET,
  DIRECTION_ROWS,
  COLOR_STATE_TO_ANIMATION,
  deriveAgentState,
} from './spriteStates.js'
import type { Direction } from './spriteStates.js'
import { sessionToCharacter } from './characterMapping.js'

export interface DrawAgentSpriteOptions {
  ctx: CanvasRenderingContext2D
  session: SessionRecord
  lastEvent: NormalizedEvent | undefined
  position: { x: number; y: number }
  direction?: Direction
  imageCache: Map<string, HTMLImageElement>
}

export function drawAgentSprite({
  ctx,
  session,
  lastEvent,
  position,
  direction = 'south',
  imageCache,
}: DrawAgentSpriteOptions): void {
  const characterType = sessionToCharacter(session.sessionId)
  const agentState = deriveAgentState(session, lastEvent)
  const animState = COLOR_STATE_TO_ANIMATION[agentState]
  const row = DIRECTION_ROWS[direction] + STATE_ROW_OFFSET[animState]
  const col = 0  // static blit: frame 0 only (no animation stepping in Phase 15)
  const src = `/sprites/${characterType}-sheet.png`

  let img = imageCache.get(src)
  if (!img) {
    img = new Image()
    img.src = src
    img.onload = () => {}  // img will be cached; next frame will draw it
    imageCache.set(src, img)
  }
  if (!img.complete) return  // skip frame if not loaded yet

  ctx.drawImage(img, col * 64, row * 64, 64, 64, position.x, position.y, 64, 64)
}
