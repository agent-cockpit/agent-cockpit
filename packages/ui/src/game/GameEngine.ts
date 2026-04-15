export class GameEngine {
  protected canvas: HTMLCanvasElement
  private rafId: number | null = null
  private lastTimestamp: number | null = null
  private readonly MAX_DELTA_MS = 100

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
  }

  start(): void {
    if (this.rafId !== null) return
    this.rafId = requestAnimationFrame(this._loop)
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.lastTimestamp = null
  }

  private _loop = (timestamp: number): void => {
    // Guard: if stop() was called while a rAF was still pending, do nothing
    if (this.rafId === null) return
    const safeTimestamp = Number.isFinite(timestamp)
      ? timestamp
      : (this.lastTimestamp ?? 0)
    const rawDelta = this.lastTimestamp !== null ? safeTimestamp - this.lastTimestamp : 0
    const deltaMs = Number.isFinite(rawDelta)
      ? Math.max(0, Math.min(rawDelta, this.MAX_DELTA_MS))
      : 0
    this.lastTimestamp = safeTimestamp
    this.update(deltaMs)
    this.render()
    this.rafId = requestAnimationFrame(this._loop)
  }

  update(_deltaMs: number): void { /* override or inject */ }
  render(): void { /* override or inject */ }
}
