import { describe, it, expect, vi } from 'vitest'
import { gameState, WORLD_W, WORLD_H } from '../GameState.js'
import * as store from '../../store/index.js'

describe('GameState', () => {
  it('gameState.camera initial value has x:0, y:0, viewportW:0, viewportH:0, zoom:2', () => {
    expect(gameState.camera).toEqual({ x: 0, y: 0, targetX: 0, targetY: 0, viewportW: 0, viewportH: 0, zoom: 2 })
  })

  it("gameState.player initial value has x: 1472 (46*32), y: 1376 (43*32), direction: 'south'", () => {
    expect(gameState.player).toEqual({ x: 1472, y: 1376, direction: 'south' })
  })

  it('gameState.tick initial value is 0', () => {
    expect(gameState.tick).toBe(0)
  })

  it('mutating gameState.camera.x = 42 does not call any Zustand store subscriber', () => {
    const subscribeSpy = vi.spyOn(store.useStore, 'subscribe')
    gameState.camera.x = 42
    expect(subscribeSpy).not.toHaveBeenCalled()
    // reset for other tests
    gameState.camera.x = 0
  })

  it('WORLD_W equals 3232 and WORLD_H equals 3232 (Cockpit Map-export dimensions)', () => {
    expect(WORLD_W).toBe(3232)
    expect(WORLD_H).toBe(3232)
  })
})
