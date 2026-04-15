import { describe, expect, it } from 'vitest'
import { stepNpcBehaviors } from '../NpcBehavior.js'

function distanceToCenter(pos: { x: number; y: number }, center: { x: number; y: number }): number {
  return Math.hypot(pos.x - center.x, pos.y - center.y)
}

describe('stepNpcBehaviors', () => {
  it('moves active NPCs in deterministic wander mode', () => {
    const sessions = [
      { sessionId: 'wander-a', status: 'active', pendingApprovals: 0 },
    ]
    const positions = {
      'wander-a': { x: 320, y: 240 },
    }

    const first = stepNpcBehaviors({
      sessions,
      positions,
      deltaMs: 1000,
      tick: 10,
      worldWidth: 2000,
      worldHeight: 1400,
    })
    const second = stepNpcBehaviors({
      sessions,
      positions,
      deltaMs: 1000,
      tick: 10,
      worldWidth: 2000,
      worldHeight: 1400,
    })

    expect(first.modes['wander-a']).toBe('wander')
    expect(first.positions['wander-a']).not.toEqual(positions['wander-a'])
    expect(first.positions['wander-a']).toEqual(second.positions['wander-a'])
  })

  it('routes attention-needed NPCs toward map center', () => {
    const center = { x: 500, y: 500 }
    const sessions = [
      { sessionId: 'needs-approval', status: 'active', pendingApprovals: 2 },
    ]
    const positions = {
      'needs-approval': { x: 120, y: 130 },
    }

    const next = stepNpcBehaviors({
      sessions,
      positions,
      deltaMs: 1000,
      tick: 0,
      worldWidth: 1000,
      worldHeight: 1000,
      center,
    })

    expect(next.modes['needs-approval']).toBe('attention')
    expect(
      distanceToCenter(next.positions['needs-approval'], center),
    ).toBeLessThan(distanceToCenter(positions['needs-approval'], center))
  })

  it('applies stable spread offsets so attention NPCs do not collapse to one point', () => {
    const sessions = [
      { sessionId: 'attention-a', status: 'error', pendingApprovals: 0 },
      { sessionId: 'attention-b', status: 'active', pendingApprovals: 1 },
      { sessionId: 'attention-c', status: 'active', pendingApprovals: 2 },
    ]
    const positions = {
      'attention-a': { x: 250, y: 250 },
      'attention-b': { x: 260, y: 250 },
      'attention-c': { x: 270, y: 250 },
    }

    const next = stepNpcBehaviors({
      sessions,
      positions,
      deltaMs: 2000,
      tick: 0,
      worldWidth: 1200,
      worldHeight: 1200,
      center: { x: 600, y: 600 },
    })

    const a = next.positions['attention-a']
    const b = next.positions['attention-b']
    const c = next.positions['attention-c']
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    expect(c).toBeDefined()
    expect(a.x === b.x && a.y === b.y).toBe(false)
    expect(a.x === c.x && a.y === c.y).toBe(false)
    expect(b.x === c.x && b.y === c.y).toBe(false)
  })

  it('keeps paused NPCs frozen while allowing non-paused NPCs to keep moving', () => {
    const sessions = [
      { sessionId: 'paused-one', status: 'active', pendingApprovals: 0 },
      { sessionId: 'moving-one', status: 'active', pendingApprovals: 0 },
    ]
    const positions = {
      'paused-one': { x: 300, y: 300 },
      'moving-one': { x: 320, y: 310 },
    }

    const next = stepNpcBehaviors({
      sessions,
      positions,
      deltaMs: 1000,
      tick: 18,
      worldWidth: 2000,
      worldHeight: 1400,
      pausedSessionIds: new Set(['paused-one']),
    })

    expect(next.modes['paused-one']).toBe('paused')
    expect(next.positions['paused-one']).toEqual(positions['paused-one'])
    expect(next.modes['moving-one']).toBe('wander')
    expect(next.positions['moving-one']).not.toEqual(positions['moving-one'])
  })
})
