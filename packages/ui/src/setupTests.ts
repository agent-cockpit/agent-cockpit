import '@testing-library/jest-dom'

// jsdom does not implement HTMLCanvasElement.prototype.getContext.
// Stub it globally so tests that render components with canvas don't throw.
const mockCanvasContext = {
  clearRect: () => {},
  fillRect: () => {},
  drawImage: () => {},
  save: () => {},
  restore: () => {},
  scale: () => {},
  translate: () => {},
} as unknown as CanvasRenderingContext2D

HTMLCanvasElement.prototype.getContext = ((contextId: string) => {
  if (contextId === '2d') {
    return mockCanvasContext
  }

  return null
}) as HTMLCanvasElement['getContext']

// jsdom does not implement ResizeObserver.
// Stub it globally so tests that render components using ResizeObserver don't throw.
if (typeof ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom does not implement OffscreenCanvas.
// Stub it globally so TilemapRenderer tests don't crash.
if (typeof OffscreenCanvas === 'undefined') {
  global.OffscreenCanvas = class MockOffscreenCanvas {
    width: number
    height: number
    constructor(w: number, h: number) { this.width = w; this.height = h }
    getContext(_type: string) {
      return {
        clearRect: () => {},
        fillRect: () => {},
        fillStyle: '',
        drawImage: () => {},
        save: () => {},
        restore: () => {},
        scale: () => {},
      }
    }
  } as unknown as typeof OffscreenCanvas
}
