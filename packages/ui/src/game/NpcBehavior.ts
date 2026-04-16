import { planPath, type WalkGrid } from './NpcPathfinding.js'

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

export interface WalkableBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface NpcRuntimeState {
  mode: NpcBehaviorMode
  target: NpcPosition | null
  path: NpcPosition[]
  pathIndex: number
  velocity: NpcPosition
  nextDecisionAtMs: number
  lastProgressAtMs: number
  stuckSinceMs: number
  failedReplans: number
  seed: number
}

export interface StepNpcBehaviorInput {
  sessions: ReadonlyArray<NpcSessionSnapshot>
  positions: Readonly<Record<string, NpcPosition>>
  deltaMs: number
  worldTimeMs: number
  worldWidth: number
  worldHeight: number
  pausedSessionIds?: ReadonlySet<string>
  center?: NpcPosition
  /** Constrains wander targets to a sub-region of the world (e.g. the room floor). */
  walkableBounds?: WalkableBounds
  runtimeBySession: Readonly<Record<string, NpcRuntimeState>>
  walkGrid?: WalkGrid | null
}

export interface StepNpcBehaviorResult {
  positions: Record<string, NpcPosition>
  modes: Record<string, NpcBehaviorMode>
  runtimeBySession: Record<string, NpcRuntimeState>
}

export const NPC_SPRITE_SIZE_PX = 64
const MIN_WORLD_PADDING = 96
const WANDER_SPEED_MIN_PX_PER_SEC = 62
const WANDER_SPEED_MAX_PX_PER_SEC = 104
const ATTENTION_SPEED_MIN_PX_PER_SEC = 92
const ATTENTION_SPEED_MAX_PX_PER_SEC = 132
const ATTENTION_SPREAD_SPACING_PX = 54
const ATTENTION_SLOW_RADIUS_PX = 120
const ATTENTION_ARRIVE_RADIUS_PX = 12
const ATTENTION_EXIT_RADIUS_PX = 24
const WANDER_SWAY_AMPLITUDE_PX = 14
const WANDER_SWAY_FREQ_HZ = 1.4
const WANDER_DECISION_MIN_MS = 2400
const WANDER_DECISION_MAX_MS = 4200
const WANDER_TARGET_REACHED_RADIUS_PX = 20
const PATH_REPLAN_STALL_MS = 800
const PATH_REPLAN_TARGET_DELTA_PX = 16
const WAYPOINT_REACHED_RADIUS_PX = 12
const PATH_LOOKAHEAD_STEPS = 2
const WANDER_ACCEL_PX_PER_SEC2 = 240
const ATTENTION_ACCEL_PX_PER_SEC2 = 300
const SEPARATION_RADIUS_PX = 72
const SEPARATION_WEIGHT = 0.82
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function distance(a: NpcPosition, b: NpcPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function normalize(v: NpcPosition): NpcPosition {
  const len = Math.hypot(v.x, v.y)
  if (len === 0) return { x: 0, y: 0 }
  return { x: v.x / len, y: v.y / len }
}

function clampPosition(pos: NpcPosition, worldWidth: number, worldHeight: number, padding = 0): NpcPosition {
  const minX = padding
  const minY = padding
  const maxX = Math.max(padding, worldWidth - NPC_SPRITE_SIZE_PX - padding)
  const maxY = Math.max(padding, worldHeight - NPC_SPRITE_SIZE_PX - padding)
  return {
    x: clamp(pos.x, minX, maxX),
    y: clamp(pos.y, minY, maxY),
  }
}

function clampToWanderBounds(pos: NpcPosition, bounds: WalkableBounds | undefined): NpcPosition {
  if (!bounds) return pos
  return {
    x: clamp(pos.x, bounds.minX, bounds.maxX),
    y: clamp(pos.y, bounds.minY, bounds.maxY),
  }
}

function getCenter(input: StepNpcBehaviorInput): NpcPosition {
  if (input.center) return input.center
  return {
    x: input.worldWidth / 2,
    y: input.worldHeight / 2,
  }
}

function getPhase(sessionId: string, salt: string): number {
  return ((hashString(`${sessionId}:${salt}`) % 3600) / 3600) * Math.PI * 2
}

function getHumanizedSpeed(
  sessionId: string,
  worldTimeMs: number,
  minSpeed: number,
  maxSpeed: number,
  modeSalt: string,
): number {
  const phase = getPhase(sessionId, modeSalt)
  const tSec = Math.max(worldTimeMs, 0) / 1000
  const wave = (Math.sin(tSec * 0.9 + phase) + 1) / 2
  return lerp(minSpeed, maxSpeed, wave)
}

function getSwayOffset(sessionId: string, worldTimeMs: number): NpcPosition {
  const phaseA = getPhase(sessionId, 'wander-sway-a')
  const phaseB = getPhase(sessionId, 'wander-sway-b')
  const tSec = Math.max(worldTimeMs, 0) / 1000
  return {
    x: Math.sin((tSec * WANDER_SWAY_FREQ_HZ * Math.PI * 2) + phaseA) * WANDER_SWAY_AMPLITUDE_PX,
    y: Math.cos((tSec * WANDER_SWAY_FREQ_HZ * Math.PI * 2 * 0.83) + phaseB) * WANDER_SWAY_AMPLITUDE_PX * 0.72,
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

function randomUnit(sessionId: string, seed: number, tag: string): number {
  return (hashString(`${sessionId}:${seed}:${tag}`) % 100000) / 100000
}

function getWanderDecisionIntervalMs(sessionId: string, seed: number, worldTimeMs: number): number {
  const serial = Math.floor(Math.max(worldTimeMs, 0) / 251) + 1
  const t = randomUnit(sessionId, seed ^ serial, 'wander-interval')
  return Math.round(lerp(WANDER_DECISION_MIN_MS, WANDER_DECISION_MAX_MS, t))
}

function getWanderTarget(
  sessionId: string,
  seed: number,
  worldTimeMs: number,
  worldWidth: number,
  worldHeight: number,
  bounds?: WalkableBounds,
): NpcPosition {
  const serial = Math.floor(Math.max(worldTimeMs, 0) / 263) + 1
  const safeMinX = bounds?.minX ?? MIN_WORLD_PADDING
  const safeMinY = bounds?.minY ?? MIN_WORLD_PADDING
  const safeMaxX = bounds?.maxX ?? (worldWidth - NPC_SPRITE_SIZE_PX - MIN_WORLD_PADDING)
  const safeMaxY = bounds?.maxY ?? (worldHeight - NPC_SPRITE_SIZE_PX - MIN_WORLD_PADDING)
  const tX = randomUnit(sessionId, seed ^ serial, 'wander-target-x')
  const tY = randomUnit(sessionId, seed ^ serial, 'wander-target-y')
  return {
    x: Math.round(lerp(safeMinX, safeMaxX, tX)),
    y: Math.round(lerp(safeMinY, safeMaxY, tY)),
  }
}

function needsAttention(session: NpcSessionSnapshot): boolean {
  return (session.pendingApprovals ?? 0) > 0 || session.status === 'error'
}

function cloneRuntime(runtime: NpcRuntimeState | undefined, sessionId: string, worldTimeMs: number): NpcRuntimeState {
  if (!runtime) {
    return {
      mode: 'wander',
      target: null,
      path: [],
      pathIndex: 0,
      velocity: { x: 0, y: 0 },
      nextDecisionAtMs: worldTimeMs,
      lastProgressAtMs: worldTimeMs,
      stuckSinceMs: 0,
      failedReplans: 0,
      seed: hashString(sessionId),
    }
  }
  return {
    mode: runtime.mode,
    target: runtime.target ? { x: runtime.target.x, y: runtime.target.y } : null,
    path: runtime.path.map((p) => ({ x: p.x, y: p.y })),
    pathIndex: runtime.pathIndex,
    velocity: { x: runtime.velocity.x, y: runtime.velocity.y },
    nextDecisionAtMs: runtime.nextDecisionAtMs,
    lastProgressAtMs: runtime.lastProgressAtMs,
    stuckSinceMs: runtime.stuckSinceMs,
    failedReplans: runtime.failedReplans,
    seed: runtime.seed,
  }
}

function separationVector(
  sessionId: string,
  current: NpcPosition,
  positions: Readonly<Record<string, NpcPosition>>,
): NpcPosition {
  let sx = 0
  let sy = 0
  for (const [otherId, otherPos] of Object.entries(positions)) {
    if (otherId === sessionId) continue
    const dx = current.x - otherPos.x
    const dy = current.y - otherPos.y
    const dist = Math.hypot(dx, dy)
    if (dist <= 0.0001 || dist >= SEPARATION_RADIUS_PX) continue
    const falloff = 1 - (dist / SEPARATION_RADIUS_PX)
    sx += (dx / dist) * falloff
    sy += (dy / dist) * falloff
  }
  return { x: sx, y: sy }
}

function moveVelocityToward(current: NpcPosition, target: NpcPosition, maxDelta: number): NpcPosition {
  return {
    x: current.x + clamp(target.x - current.x, -maxDelta, maxDelta),
    y: current.y + clamp(target.y - current.y, -maxDelta, maxDelta),
  }
}

export function stepNpcBehaviors(input: StepNpcBehaviorInput): StepNpcBehaviorResult {
  const nextPositions: Record<string, NpcPosition> = {}
  const modes: Record<string, NpcBehaviorMode> = {}
  const runtimeBySession: Record<string, NpcRuntimeState> = {}
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
    const runtime = cloneRuntime(input.runtimeBySession[session.sessionId], session.sessionId, input.worldTimeMs)
    const isPaused = paused.has(session.sessionId)
    const isAttention = attentionIndexBySession.has(session.sessionId)
    const mode: NpcBehaviorMode = isPaused ? 'paused' : (isAttention ? 'attention' : 'wander')
    runtime.mode = mode
    modes[session.sessionId] = mode

    if (mode === 'paused') {
      runtime.velocity = { x: 0, y: 0 }
      runtime.path = []
      runtime.pathIndex = 0
      runtime.target = clampedCurrent
      runtime.stuckSinceMs = 0
      runtime.lastProgressAtMs = input.worldTimeMs
      nextPositions[session.sessionId] = clampedCurrent
      runtimeBySession[session.sessionId] = runtime
      continue
    }

    if (mode === 'attention') {
      const spreadOffset = getAttentionOffset(attentionIndexBySession.get(session.sessionId) ?? 0)
      runtime.target = clampPosition(
        { x: center.x + spreadOffset.x, y: center.y + spreadOffset.y },
        input.worldWidth,
        input.worldHeight,
      )
      runtime.path = runtime.path.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      if (runtime.pathIndex < 0 || runtime.pathIndex >= runtime.path.length) {
        runtime.pathIndex = 0
      }
      const toAttention = distance(clampedCurrent, runtime.target)
      const isHoldingAttention =
        runtime.path.length === 0 &&
        Math.hypot(runtime.velocity.x, runtime.velocity.y) < 1 &&
        toAttention <= ATTENTION_EXIT_RADIUS_PX
      if (isHoldingAttention) {
        nextPositions[session.sessionId] = clampedCurrent
        runtimeBySession[session.sessionId] = runtime
        continue
      }
    } else {
      const shouldPickNewTarget =
        runtime.target === null ||
        input.worldTimeMs >= runtime.nextDecisionAtMs ||
        distance(clampedCurrent, runtime.target) <= WANDER_TARGET_REACHED_RADIUS_PX
      if (shouldPickNewTarget) {
        runtime.target = getWanderTarget(
          session.sessionId,
          runtime.seed,
          input.worldTimeMs,
          input.worldWidth,
          input.worldHeight,
          input.walkableBounds,
        )
        runtime.nextDecisionAtMs = input.worldTimeMs + getWanderDecisionIntervalMs(
          session.sessionId,
          runtime.seed,
          input.worldTimeMs,
        )
        runtime.path = []
        runtime.pathIndex = 0
      }
    }

    const baseTarget = runtime.target ?? clampedCurrent
    const pathGoal = clampPosition(
      mode === 'wander' ? clampToWanderBounds(baseTarget, input.walkableBounds) : baseTarget,
      input.worldWidth,
      input.worldHeight,
    )
    runtime.target = pathGoal

    const lastPathPoint = runtime.path.length > 0 ? runtime.path[runtime.path.length - 1] : null
    const targetMoved = !lastPathPoint || distance(lastPathPoint, pathGoal) > PATH_REPLAN_TARGET_DELTA_PX
    const pathExhausted = runtime.path.length === 0 || runtime.pathIndex >= runtime.path.length
    const stalledForReplan = (input.worldTimeMs - runtime.lastProgressAtMs) >= PATH_REPLAN_STALL_MS
    const shouldAttemptInitialPath = runtime.path.length === 0 && runtime.failedReplans === 0
    const shouldReplan = !!input.walkGrid && (
      targetMoved ||
      shouldAttemptInitialPath ||
      (pathExhausted && stalledForReplan)
    )

    if (shouldReplan && input.walkGrid) {
      const plannedPath = planPath(clampedCurrent, pathGoal, input.walkGrid)
      if (plannedPath.length > 0) {
        runtime.path = plannedPath
        runtime.pathIndex = 0
        runtime.failedReplans = 0
      } else {
        runtime.path = []
        runtime.pathIndex = 0
        runtime.failedReplans += 1
        // Rate-limit retries via the same stall gate.
        runtime.lastProgressAtMs = input.worldTimeMs
      }
    }

    if (mode === 'attention' && distance(clampedCurrent, pathGoal) <= ATTENTION_ARRIVE_RADIUS_PX) {
      runtime.path = []
      runtime.pathIndex = 0
      runtime.velocity = { x: 0, y: 0 }
      nextPositions[session.sessionId] = clampedCurrent
      runtimeBySession[session.sessionId] = runtime
      continue
    }

    let steeringTarget = pathGoal
    if (runtime.path.length > 0) {
      runtime.pathIndex = clamp(runtime.pathIndex, 0, runtime.path.length - 1)
      while (
        runtime.pathIndex < runtime.path.length - 1 &&
        distance(clampedCurrent, runtime.path[runtime.pathIndex]!) <= WAYPOINT_REACHED_RADIUS_PX
      ) {
        runtime.pathIndex += 1
      }
      const lookAheadIndex = Math.min(runtime.pathIndex + PATH_LOOKAHEAD_STEPS, runtime.path.length - 1)
      steeringTarget = runtime.path[lookAheadIndex]!
    }

    if (mode === 'wander') {
      const sway = getSwayOffset(session.sessionId, input.worldTimeMs)
      steeringTarget = clampToWanderBounds(
        { x: steeringTarget.x + sway.x, y: steeringTarget.y + sway.y },
        input.walkableBounds,
      )
    }

    const toTarget = normalize({
      x: steeringTarget.x - clampedCurrent.x,
      y: steeringTarget.y - clampedCurrent.y,
    })
    const separation = normalize(separationVector(session.sessionId, clampedCurrent, input.positions))
    const desiredDirection = normalize({
      x: toTarget.x + (separation.x * SEPARATION_WEIGHT),
      y: toTarget.y + (separation.y * SEPARATION_WEIGHT),
    })

    let desiredSpeed = 0
    if (desiredDirection.x !== 0 || desiredDirection.y !== 0) {
      if (mode === 'attention') {
        desiredSpeed = getHumanizedSpeed(
          session.sessionId,
          input.worldTimeMs,
          ATTENTION_SPEED_MIN_PX_PER_SEC,
          ATTENTION_SPEED_MAX_PX_PER_SEC,
          'attention-speed',
        )
        const distanceToGoal = distance(clampedCurrent, pathGoal)
        desiredSpeed *= clamp(distanceToGoal / ATTENTION_SLOW_RADIUS_PX, 0.25, 1)
      } else {
        desiredSpeed = getHumanizedSpeed(
          session.sessionId,
          input.worldTimeMs,
          WANDER_SPEED_MIN_PX_PER_SEC,
          WANDER_SPEED_MAX_PX_PER_SEC,
          'wander-speed',
        )
        const distanceToGoal = distance(clampedCurrent, pathGoal)
        desiredSpeed *= clamp(distanceToGoal / 90, 0.35, 1)
      }
    }

    const desiredVelocity = {
      x: desiredDirection.x * desiredSpeed,
      y: desiredDirection.y * desiredSpeed,
    }
    const accel = mode === 'attention' ? ATTENTION_ACCEL_PX_PER_SEC2 : WANDER_ACCEL_PX_PER_SEC2
    const maxVelocityDelta = accel * deltaSec
    runtime.velocity = moveVelocityToward(runtime.velocity, desiredVelocity, maxVelocityDelta)

    if (desiredSpeed < 0.1 && Math.hypot(runtime.velocity.x, runtime.velocity.y) < 2) {
      runtime.velocity = { x: 0, y: 0 }
    }

    const unclampedNext = {
      x: clampedCurrent.x + runtime.velocity.x * deltaSec,
      y: clampedCurrent.y + runtime.velocity.y * deltaSec,
    }
    const worldClampedNext = clampPosition(unclampedNext, input.worldWidth, input.worldHeight)
    const boundedNext = mode === 'wander'
      ? clampToWanderBounds(worldClampedNext, input.walkableBounds)
      : worldClampedNext

    nextPositions[session.sessionId] = boundedNext
    runtimeBySession[session.sessionId] = runtime
  }

  return { positions: nextPositions, modes, runtimeBySession }
}
