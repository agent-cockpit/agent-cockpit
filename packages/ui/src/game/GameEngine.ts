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
    const raw = this.lastTimestamp !== null ? timestamp - this.lastTimestamp : 0
    const deltaMs = Math.min(raw, this.MAX_DELTA_MS)
    this.lastTimestamp = timestamp
    this.update(deltaMs)
    this.render()
    this.rafId = requestAnimationFrame(this._loop)
  }

  update(_deltaMs: number): void { /* override or inject */ }
  render(): void { /* override or inject */ }
}
