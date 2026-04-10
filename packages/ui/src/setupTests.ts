import '@testing-library/jest-dom'

// jsdom does not implement HTMLCanvasElement.prototype.getContext.
// Stub it globally so tests that render components with canvas don't throw.
HTMLCanvasElement.prototype.getContext = function () {
  return {
    clearRect: () => {},
    fillRect: () => {},
    drawImage: () => {},
    save: () => {},
    restore: () => {},
    scale: () => {},
    translate: () => {},
  } as unknown as CanvasRenderingContext2D
}

// jsdom does not implement ResizeObserver.
// Stub it globally so tests that render components using ResizeObserver don't throw.
if (typeof ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
