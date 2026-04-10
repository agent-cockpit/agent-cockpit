---
phase: 15-game-engine-foundation
plan: "02"
subsystem: game-engine
tags: [canvas, camera, game-engine, resize-observer, tdd, typescript, react]
dependency_graph:
  requires: [GameEngine, GameState, WORLD_W, WORLD_H]
  provides: [Camera, canvas-mount, engine-lifecycle, ResizeObserver-stub]
  affects: [15-03, 15-04, 15-05]
tech_stack:
  added: []
  patterns: [TDD-red-green, inline-subclass, ResizeObserver, lerp-clamp]
key_files:
  created:
    - packages/ui/src/game/Camera.ts
    - packages/ui/src/game/__tests__/Camera.test.ts
    - packages/ui/src/pages/__tests__/OfficePage.test.tsx
  modified:
    - packages/ui/src/pages/OfficePage.tsx
    - packages/ui/src/setupTests.ts
decisions:
  - "Global stubs for HTMLCanvasElement.getContext and ResizeObserver added to setupTests.ts to unblock all jsdom tests that render canvas components"
  - "GameEngine subclassed inline (anonymous class) inside OfficePage useEffect for clarity and co-location"
  - "ResizeObserver useEffect uses separate cleanup (disconnect) independent of engine lifecycle"
metrics:
  duration: "4m"
  completed_date: "2026-04-10"
  tasks_completed: 3
  files_created: 3
  files_modified: 2
---

# Phase 15 Plan 02: Canvas Mount and Camera Module Summary

**One-liner:** Canvas element mounted in OfficePage at z-index 0 behind React overlay with GameEngine lifecycle wired via useEffect, plus a pure Camera module that lerps x/y toward targets and clamps to world bounds.

## What Was Built

### Camera (packages/ui/src/game/Camera.ts)

A zero-dependency pure TypeScript module:

- `CameraState` interface: `{ x, y, targetX, targetY, viewportW, viewportH }`
- `WorldBounds` interface: `{ minX, minY, maxX, maxY }`
- `LERP_FACTOR = 0.1` named constant (tunable)
- `updateCamera(cam, bounds, _deltaMs)`: lerps `cam.x += (targetX - x) * LERP_FACTOR`, same for Y, then clamps both axes to world bounds

Convergence: after 100 calls with target=500, camera arrives within 1px (geometric series sums to target).

### OfficePage Canvas Mount (packages/ui/src/pages/OfficePage.tsx)

Three additions to the existing page:

1. **Refs:** `canvasRef` (HTMLCanvasElement) and `containerRef` (HTMLDivElement)

2. **Engine lifecycle useEffect:** Creates an inline anonymous subclass of `GameEngine`. The `update()` override increments `gameState.tick` and calls `updateCamera` with full world bounds. The `render()` override calls `ctx.clearRect` (transparent clear — no sprites yet). Effect calls `engine.start()` on mount, returns `engine.stop()` as cleanup.

3. **ResizeObserver useEffect:** Observes the outer container div and sets `canvas.width / canvas.height = Math.round(entry.contentRect.*width/height*)` on resize. Returns `observer.disconnect()` as cleanup.

4. **JSX layout:** `<canvas data-testid="game-canvas" style={{ position:'absolute', inset:0, zIndex:0 }} />` added as first child of the `data-testid="office-canvas"` container. All existing React content wrapped in `<div style={{ position:'relative', zIndex:1 }}>`.

### Test Infrastructure (packages/ui/src/setupTests.ts)

Added global stubs in the shared setup file:
- `HTMLCanvasElement.prototype.getContext` → returns a minimal no-op context object
- `global.ResizeObserver` → stub class with no-op observe/unobserve/disconnect

These prevent jsdom crashes in any test that renders a component containing canvas or ResizeObserver.

## Tests

| File | Tests | Result |
|------|-------|--------|
| Camera.test.ts | 6 | All green |
| OfficePage.test.tsx (new) | 4 | All green |
| OfficePage.test.tsx (pre-existing, src/__tests__) | 11 | All green (was crashing before setupTests fix) |

Full pre-existing suite: 3 failures pre-existed (eventsSlice dedup, approvalsSlice state reference, approval card badge — same as after Plan 15-01). Zero regressions introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical setup] Added global canvas and ResizeObserver stubs to setupTests.ts**
- **Found during:** Task 2 - OfficePage GREEN phase
- **Issue:** Adding canvas + ResizeObserver to OfficePage caused all 11 pre-existing OfficePage tests to crash: `ResizeObserver is not defined` (jsdom) and `HTMLCanvasElement.prototype.getContext not implemented` (jsdom). These weren't bugs in new code, but necessary polyfills for jsdom test compatibility.
- **Fix:** Added stubs to `src/setupTests.ts` (shared across all tests). The new `OfficePage.test.tsx` (in `src/pages/__tests__/`) separately overrides `getContext` in its `beforeEach` for more precise control in engine lifecycle tests.
- **Files modified:** packages/ui/src/setupTests.ts
- **Commit:** a2ae2e8

## Commits

| Hash | Message |
|------|---------|
| 4afa55c | test(15-02): add failing test stubs for Camera and OfficePage canvas mount |
| a244942 | feat(15-02): implement Camera module with lerp and bounds clamping |
| a2ae2e8 | feat(15-02): mount canvas in OfficePage with GameEngine lifecycle and ResizeObserver |

## Self-Check: PASSED

All 3 created files present on disk. All 3 task commits confirmed in git log.
