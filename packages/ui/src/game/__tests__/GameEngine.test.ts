import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GameEngine } from '../GameEngine.js'

// rAF mock — captures callback, does NOT auto-invoke it
let rafCallback: ((timestamp: number) => void) | null = null
let rafIdCounter = 0
let cancelledIds: number[] = []

function triggerFrame(timestamp: number): void {
  if (rafCallback) {
    const cb = rafCallback
    rafCallback = null
    cb(timestamp)
  }
}

describe('GameEngine', () => {
  let canvas: HTMLCanvasElement
  let engine: GameEngine

  beforeEach(() => {
    rafIdCounter = 0
    cancelledIds = []
    rafCallback = null

    vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => {
      rafCallback = cb
      return ++rafIdCounter
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      cancelledIds.push(id)
    })

    canvas = document.createElement('canvas')
    engine = new GameEngine(canvas)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('start() calls requestAnimationFrame', () => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame')
    engine.start()
    expect(rafSpy).toHaveBeenCalledOnce()
  })

  it('stop() calls cancelAnimationFrame with the registered rafId', () => {
    engine.start()
    const registeredId = rafIdCounter
    engine.stop()
    expect(cancelledIds).toContain(registeredId)
  })

  it('stop() after stop() is a no-op (rafId already null)', () => {
    engine.start()
    engine.stop()
    const cancelCountAfterFirst = cancelledIds.length
    engine.stop()
    expect(cancelledIds.length).toBe(cancelCountAfterFirst)
  })

  it('start() called twice does not register a second rAF (double-start guard)', () => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame')
    engine.start()
    engine.start()
    expect(rafSpy).toHaveBeenCalledOnce()
  })

  it('update() receives deltaMs = 0 on the first tick (no prior timestamp)', () => {
    const updateSpy = vi.spyOn(engine, 'update')
    engine.start()
    triggerFrame(1000)
    expect(updateSpy).toHaveBeenCalledWith(0)
  })

  it('update() receives deltaMs capped at 100 when raw gap is 5000ms', () => {
    const updateSpy = vi.spyOn(engine, 'update')
    engine.start()
    triggerFrame(1000)   // first tick — delta = 0, sets lastTimestamp = 1000
    triggerFrame(6000)   // raw delta = 5000 — should be capped at 100
    expect(updateSpy).toHaveBeenCalledWith(100)
  })

  it('after stop(), update() is not called on subsequent rAF ticks', () => {
    const updateSpy = vi.spyOn(engine, 'update')
    engine.start()
    triggerFrame(1000)
    engine.stop()
    // Attempt to trigger another frame after stop — no callback should be registered
    if (rafCallback) {
      rafCallback(2000)
    }
    // update should have been called only once (from the first triggerFrame)
    expect(updateSpy).toHaveBeenCalledTimes(1)
  })
})
