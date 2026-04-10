---
phase: 15-game-engine-foundation
plan: "01"
subsystem: game-engine
tags: [game-engine, raf-loop, game-state, tdd, typescript]
dependency_graph:
  requires: []
  provides: [GameEngine, GameState, WORLD_W, WORLD_H]
  affects: [15-02, 15-03, 15-04, 15-05]
tech_stack:
  added: []
  patterns: [rAF-loop, mutable-singleton, TDD-red-green]
key_files:
  created:
    - packages/ui/src/game/GameEngine.ts
    - packages/ui/src/game/GameState.ts
    - packages/ui/src/game/__tests__/GameEngine.test.ts
    - packages/ui/src/game/__tests__/GameState.test.ts
  modified: []
decisions:
  - "_loop guard (rafId === null check) added to prevent update() from firing after stop() when a pending rAF callback exists"
metrics:
  duration: "2m"
  completed_date: "2026-04-10"
  tasks_completed: 3
  files_created: 4
  files_modified: 0
---

# Phase 15 Plan 01: Game Engine Foundation Summary

**One-liner:** Plain TypeScript rAF loop class with double-start guard and 100ms delta cap, plus a zero-dependency mutable singleton for per-frame game world state.

## What Was Built

### GameEngine (packages/ui/src/game/GameEngine.ts)

A TypeScript class that owns a `requestAnimationFrame` loop:

- `start()` registers the rAF callback; double-start guard returns early if `rafId !== null`
- `stop()` cancels rAF, nulls `rafId` and `lastTimestamp`
- `_loop(timestamp)` computes delta time, caps at `MAX_DELTA_MS=100` to prevent spiral-of-death, calls `update()` and `render()`, then schedules the next frame
- `_loop` guards against running after `stop()` by checking `rafId === null` at entry
- `update()` and `render()` are overridable no-op methods for subclassing or injection
- Constructor accepts `HTMLCanvasElement` stored as `protected canvas`

### GameState (packages/ui/src/game/GameState.ts)

A zero-import module providing:

- `WORLD_W = 1920` (96 * 20) and `WORLD_H = 1440` (96 * 15) named constants
- `GameState` interface: camera, player, npcs, tick
- `gameState` singleton with initial values: `camera={0,0,0,0}`, `player={192,480,'south'}`, `npcs={}`, `tick=0`
- No React, Zustand, or framework imports — direct mutation never triggers re-renders

## Tests

| File | Tests | Result |
|------|-------|--------|
| GameEngine.test.ts | 7 | All green |
| GameState.test.ts | 5 | All green |

Full pre-existing suite: 3 failures pre-existed before this plan (eventsSlice dedup, approvalsSlice state reference, approval card badge). Zero regressions introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added stop-guard to _loop to prevent post-stop update() call**
- **Found during:** Task 1 - GameEngine GREEN phase
- **Issue:** After `stop()`, the already-registered rAF callback still fired in tests. Without the guard, `update()` was called a second time after `engine.stop()`.
- **Fix:** Added early return at top of `_loop`: `if (this.rafId === null) return`
- **Files modified:** packages/ui/src/game/GameEngine.ts
- **Commit:** 7a96a03

## Commits

| Hash | Message |
|------|---------|
| ebdaace | test(15-01): add failing test stubs for GameEngine and GameState |
| 7a96a03 | feat(15-01): implement GameEngine class with rAF loop, delta time, pause/resume |
| 1c296e1 | feat(15-01): implement GameState singleton and world constants |

## Self-Check: PASSED
