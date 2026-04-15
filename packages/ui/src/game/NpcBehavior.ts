export interface NpcPosition {
  x: number
  y: number
}

export interface NpcSessionSnapshot {
  sessionId: string
  pendingApprovals?: number
  status?: string
}

export type NpcBehaviorMode = 'wander' | 'attention' | 'paused'

export interface StepNpcBehaviorInput {
  sessions: ReadonlyArray<NpcSessionSnapshot>
  positions: Readonly<Record<string, NpcPosition>>
  deltaMs: number
  tick: number
  worldWidth: number
  worldHeight: number
  pausedSessionIds?: ReadonlySet<string>
  center?: NpcPosition
}

export interface StepNpcBehaviorResult {
  positions: Record<string, NpcPosition>
  modes: Record<string, NpcBehaviorMode>
}

const NPC_SPRITE_SIZE_PX = 64
const MIN_WORLD_PADDING = 96
const WANDER_SPEED_PX_PER_SEC = 88
const ATTENTION_SPEED_PX_PER_SEC = 118
const WANDER_STEP_FRAMES = 140
const WANDER_RADIUS_MIN_PX = 64
const WANDER_RADIUS_MAX_PX = 240
const ATTENTION_SPREAD_SPACING_PX = 54
const GOLDEN_ANGLE_RAD = 2.399963229728653

function hashString(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clampPosition(pos: NpcPosition, worldWidth: number, worldHeight: number): NpcPosition {
  const maxX = Math.max(0, worldWidth - NPC_SPRITE_SIZE_PX)
  const maxY = Math.max(0, worldHeight - NPC_SPRITE_SIZE_PX)
  return {
    x: clamp(pos.x, 0, maxX),
    y: clamp(pos.y, 0, maxY),
  }
}

function moveToward(start: NpcPosition, target: NpcPosition, maxDistance: number): NpcPosition {
  const dx = target.x - start.x
  const dy = target.y - start.y
  const distance = Math.hypot(dx, dy)
  if (distance <= maxDistance || distance === 0) {
    return { x: target.x, y: target.y }
  }
  const scale = maxDistance / distance
  return { x: start.x + dx * scale, y: start.y + dy * scale }
}

function getCenter(input: StepNpcBehaviorInput): NpcPosition {
  if (input.center) return input.center
  return {
    x: input.worldWidth / 2,
    y: input.worldHeight / 2,
  }
}

function getAttentionOffset(index: number): NpcPosition {
  if (index <= 0) return { x: 0, y: 0 }
  const ring = Math.ceil(Math.sqrt(index))
  const radius = ring * ATTENTION_SPREAD_SPACING_PX
  const angle = index * GOLDEN_ANGLE_RAD
  return {
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius),
  }
}

function getWanderAnchor(sessionId: string, worldWidth: number, worldHeight: number): NpcPosition {
  const hash = hashString(sessionId)
  const usableW = Math.max(NPC_SPRITE_SIZE_PX, worldWidth - MIN_WORLD_PADDING * 2 - NPC_SPRITE_SIZE_PX)
  const usableH = Math.max(NPC_SPRITE_SIZE_PX, worldHeight - MIN_WORLD_PADDING * 2 - NPC_SPRITE_SIZE_PX)

  return {
    x: MIN_WORLD_PADDING + (hash % usableW),
    y: MIN_WORLD_PADDING + ((hash >>> 8) % usableH),
  }
}

function getWanderTarget(
  sessionId: string,
  tick: number,
  worldWidth: number,
  worldHeight: number,
): NpcPosition {
  const anchor = getWanderAnchor(sessionId, worldWidth, worldHeight)
  const phaseStep = Math.floor(Math.max(tick, 0) / WANDER_STEP_FRAMES)
  const baseHash = hashString(sessionId)
  const waypointHash = hashString(`${sessionId}:${phaseStep}`)
  const angle = ((waypointHash % 3600) / 3600) * Math.PI * 2
  const radius = WANDER_RADIUS_MIN_PX + (baseHash % (WANDER_RADIUS_MAX_PX - WANDER_RADIUS_MIN_PX + 1))
  return clampPosition(
    {
      x: anchor.x + Math.cos(angle) * radius,
      y: anchor.y + Math.sin(angle) * radius,
    },
    worldWidth,
    worldHeight,
  )
}

function needsAttention(session: NpcSessionSnapshot): boolean {
  return (session.pendingApprovals ?? 0) > 0 || session.status === 'error'
}

export function stepNpcBehaviors(input: StepNpcBehaviorInput): StepNpcBehaviorResult {
  const nextPositions: Record<string, NpcPosition> = {}
  const modes: Record<string, NpcBehaviorMode> = {}
  const deltaSec = Math.max(input.deltaMs, 0) / 1000
  const paused = input.pausedSessionIds ?? new Set<string>()
  const center = getCenter(input)

  const attentionSessionIds = input.sessions
    .filter((session) => needsAttention(session))
    .map((session) => session.sessionId)
    .sort((a, b) => a.localeCompare(b))
  const attentionIndexBySession = new Map<string, number>()
  attentionSessionIds.forEach((sessionId, index) => {
    attentionIndexBySession.set(sessionId, index)
  })

  for (const session of input.sessions) {
    const current = input.positions[session.sessionId]
    if (!current) continue

    const clampedCurrent = clampPosition(current, input.worldWidth, input.worldHeight)
    const isPaused = paused.has(session.sessionId)
    const isAttention = attentionIndexBySession.has(session.sessionId)

    if (isPaused) {
      nextPositions[session.sessionId] = clampedCurrent
      modes[session.sessionId] = 'paused'
      continue
    }

    if (isAttention) {
      const spreadOffset = getAttentionOffset(attentionIndexBySession.get(session.sessionId) ?? 0)
      const target = clampPosition(
        { x: center.x + spreadOffset.x, y: center.y + spreadOffset.y },
        input.worldWidth,
        input.worldHeight,
      )
      nextPositions[session.sessionId] = moveToward(clampedCurrent, target, ATTENTION_SPEED_PX_PER_SEC * deltaSec)
      modes[session.sessionId] = 'attention'
      continue
    }

    const wanderTarget = getWanderTarget(session.sessionId, input.tick, input.worldWidth, input.worldHeight)
    nextPositions[session.sessionId] = moveToward(clampedCurrent, wanderTarget, WANDER_SPEED_PX_PER_SEC * deltaSec)
    modes[session.sessionId] = 'wander'
  }

  return { positions: nextPositions, modes }
}
