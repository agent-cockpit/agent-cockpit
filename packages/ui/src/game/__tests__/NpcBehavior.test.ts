import { describe, expect, it } from 'vitest'
import { stepNpcBehaviors, type NpcRuntimeState } from '../NpcBehavior.js'
import type { WalkGrid } from '../NpcPathfinding.js'

interface SimState {
  positions: Record<string, { x: number; y: number }>
  runtimeBySession: Record<string, NpcRuntimeState>
  worldTimeMs: number
}

function makeGrid(cols: number, rows: number, walkableValue = 1): WalkGrid {
  return {
    cellSize: 32,
    cols,
    rows,
    walkable: new Uint8Array(cols * rows).fill(walkableValue),
  }
}

function stepSim(
  state: SimState,
  deltaMs: number,
  pausedSessionIds: ReadonlySet<string> = new Set(),
  grid: WalkGrid | null = makeGrid(110, 110),
): SimState {
  const sessions = [{ sessionId: 'npc-a', status: 'active', pendingApprovals: 0 }]
  const nextWorldTime = state.worldTimeMs + deltaMs
  const step = stepNpcBehaviors({
    sessions,
    positions: state.positions,
    runtimeBySession: state.runtimeBySession,
    deltaMs,
    worldTimeMs: nextWorldTime,
    worldWidth: 3232,
    worldHeight: 3232,
    pausedSessionIds,
    walkableBounds: { minX: 1800, minY: 1760, maxX: 2280, maxY: 2200 },
    walkGrid: grid,
  })

  return {
    positions: step.positions,
    runtimeBySession: step.runtimeBySession,
    worldTimeMs: nextWorldTime,
  }
}

describe('stepNpcBehaviors', () => {
  it('is deterministic across frame rates over 10s (16ms vs 33ms) within 2px', () => {
    let fast: SimState = {
      positions: { 'npc-a': { x: 2016, y: 1920 } },
      runtimeBySession: {},
      worldTimeMs: 0,
    }
    let slow: SimState = {
      positions: { 'npc-a': { x: 2016, y: 1920 } },
      runtimeBySession: {},
      worldTimeMs: 0,
    }

    while (fast.worldTimeMs < 10000) {
      fast = stepSim(fast, 16)
    }
    while (slow.worldTimeMs < 10000) {
      slow = stepSim(slow, 33)
    }

    const posFast = fast.positions['npc-a']!
    const posSlow = slow.positions['npc-a']!
    const delta = Math.hypot(posFast.x - posSlow.x, posFast.y - posSlow.y)
    expect(delta).toBeLessThanOrEqual(2)
  })

  it('keeps paused NPCs stationary and disables stuck accumulation', () => {
    let state: SimState = {
      positions: { 'npc-a': { x: 2060, y: 1940 } },
      runtimeBySession: {},
      worldTimeMs: 0,
    }

    const paused = new Set(['npc-a'])
    for (let i = 0; i < 30; i++) {
      state = stepSim(state, 250, paused)
    }

    expect(state.positions['npc-a']).toEqual({ x: 2060, y: 1940 })
    const runtime = state.runtimeBySession['npc-a']
    expect(runtime).toBeDefined()
    if (!runtime) return
    expect(runtime.mode).toBe('paused')
    expect(runtime.stuckSinceMs).toBe(0)
    expect(runtime.failedReplans).toBe(0)
  })

  it('converges attention NPCs toward center and holds without jittering', () => {
    const center = { x: 2080, y: 1920 }
    let state: SimState = {
      positions: { 'npc-a': { x: 1600, y: 1500 } },
      runtimeBySession: {},
      worldTimeMs: 0,
    }

    for (let i = 0; i < 120; i++) {
      const nextWorldTime = state.worldTimeMs + 50
      const step = stepNpcBehaviors({
        sessions: [{ sessionId: 'npc-a', status: 'active', pendingApprovals: 2 }],
        positions: state.positions,
        runtimeBySession: state.runtimeBySession,
        deltaMs: 50,
        worldTimeMs: nextWorldTime,
        worldWidth: 3232,
        worldHeight: 3232,
        center,
        walkGrid: makeGrid(110, 110),
      })
      state = {
        positions: step.positions,
        runtimeBySession: step.runtimeBySession,
        worldTimeMs: nextWorldTime,
      }
    }

    const settled = state.positions['npc-a']!
    const d1 = Math.hypot(settled.x - center.x, settled.y - center.y)
    expect(d1).toBeLessThan(24)

    for (let i = 0; i < 40; i++) {
      const nextWorldTime = state.worldTimeMs + 50
      const step = stepNpcBehaviors({
        sessions: [{ sessionId: 'npc-a', status: 'active', pendingApprovals: 2 }],
        positions: state.positions,
        runtimeBySession: state.runtimeBySession,
        deltaMs: 50,
        worldTimeMs: nextWorldTime,
        worldWidth: 3232,
        worldHeight: 3232,
        center,
        walkGrid: makeGrid(110, 110),
      })
      state = {
        positions: step.positions,
        runtimeBySession: step.runtimeBySession,
        worldTimeMs: nextWorldTime,
      }
    }

    const held = state.positions['npc-a']!
    const settleDrift = Math.hypot(held.x - settled.x, held.y - settled.y)
    expect(settleDrift).toBeLessThanOrEqual(2)
  })

  it('replans when blocked and increments failedReplans before any teleport fallback', () => {
    let state: SimState = {
      positions: { 'npc-a': { x: 2016, y: 1920 } },
      runtimeBySession: {},
      worldTimeMs: 0,
    }
    const blockedGrid = makeGrid(110, 110, 0)

    for (let i = 0; i < 20; i++) {
      state = stepSim(state, 200, new Set(), blockedGrid)
    }

    expect(state.positions['npc-a']).toEqual({ x: 2016, y: 1920 })
    const runtime = state.runtimeBySession['npc-a']
    expect(runtime).toBeDefined()
    if (!runtime) return
    expect(runtime.failedReplans).toBeGreaterThanOrEqual(3)
    expect(runtime.path.length).toBe(0)
  })
})
