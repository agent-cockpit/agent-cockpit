---
phase: 16-player-controls
plan: 01
subsystem: ui
tags: [canvas, game-engine, input, player-movement, wasd, vitest, tdd]

# Dependency graph
requires:
  - phase: 15-game-engine-foundation
    provides: GameEngine base class, GameState singleton, Camera module, OfficePage canvas loop
provides:
  - PlayerInput.ts module with PLAYER_SPEED, attachInput, detachInput, getKeysDown, movePlayer exports
  - WASD and arrow key player movement wired into OfficePage engine.update()
  - Camera follow (cam.targetX/Y = player.x/y) wired into engine.update()
  - Full TDD test suite for all player movement behaviours (32 tests)
affects: [17-npc-behavior, 18-audio, click-to-teleport, save-load]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PlayerInput as pure-function module: movePlayer() takes player + keys + deltaMs, no side effects"
    - "Input guard: early return in onKeyDown when focused element is input/textarea/select/contenteditable"
    - "Diagonal normalisation: multiply dx/dy by INV_SQRT2 (0.7071) when both non-zero"
    - "attachInput/detachInput co-located with engine.start()/stop() in single useEffect"

key-files:
  created:
    - packages/ui/src/game/PlayerInput.ts
    - packages/ui/src/game/__tests__/PlayerInput.test.ts
  modified:
    - packages/ui/src/pages/OfficePage.tsx

key-decisions:
  - "PlayerInput module uses module-level keysDown Set and _attached guard for idempotent attach/detach"
  - "movePlayer() is a pure function taking explicit player + keys + deltaMs — no hidden state access, fully testable"
  - "INV_SQRT2 = 0.7071 constant for diagonal normalisation (not Math.sqrt calculation per frame)"
  - "Camera follow implemented inline in engine.update() (cam.targetX = player.x - viewportW/2)"

patterns-established:
  - "TDD RED-GREEN for game modules: write all behavior specs as failing tests, then implement"
  - "Input guards prevent keysDown pollution when text inputs are focused"
  - "World bounds clamping: Math.max(0, Math.min(value, WORLD_W/H - 64))"

requirements-completed: [player-movement, input-tracking]

# Metrics
duration: 3min
completed: 2026-04-11
---

# Phase 16 Plan 01: PlayerInput Module Summary

**WASD/arrow key player movement with diagonal normalisation, world-bounds clamping, direction tracking, and camera follow — built TDD with 32 unit tests**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-11T02:52:25Z
- **Completed:** 2026-04-11T02:55:07Z
- **Tasks:** 2 (TDD: RED + GREEN + wire)
- **Files modified:** 3

## Accomplishments
- PlayerInput.ts module: held-key Set, attachInput/detachInput lifecycle, movePlayer() pure function
- 32 unit tests covering speed, diagonal normalisation, bounds clamping, direction (8 directions), input guards, lifecycle
- OfficePage wired: movePlayer() called in engine.update(), cam.targetX/Y set to follow player, attachInput/detachInput co-located with engine lifecycle
- All 8 OfficePage tests remain green (no regression)

## Task Commits

1. **test(16-01): add failing tests for PlayerInput module** — `6283e4e` (test — TDD RED)
2. **feat(16-01): implement PlayerInput module — TDD GREEN** — `38b7512` (feat — TDD GREEN)
3. **feat(16-01): wire PlayerInput into OfficePage game loop and cleanup** — `f94c314` (feat)

## Files Created/Modified
- `packages/ui/src/game/PlayerInput.ts` — PLAYER_SPEED, keysDown Set, attachInput, detachInput, getKeysDown, movePlayer, deriveDirection
- `packages/ui/src/game/__tests__/PlayerInput.test.ts` — 32 tests covering all behaviour specs
- `packages/ui/src/pages/OfficePage.tsx` — Added PlayerInput imports, movePlayer + camera follow in update(), attachInput/detachInput in lifecycle

## Decisions Made
- movePlayer() is a pure function (takes player + keys + deltaMs explicitly) for clean testability without mocking module state
- INV_SQRT2 = 0.7071 precomputed constant — avoids Math.sqrt per frame
- attachInput/detachInput co-located in same useEffect as engine.start()/stop() to guarantee teardown together
- Camera follow: cam.targetX = player.x - cam.viewportW / 2 (center player in viewport), set before updateCamera() smooths it

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test starting positions too close to world bounds**
- **Found during:** Task 1 (TDD GREEN — first run)
- **Issue:** Tests for W and A movement started player at (100, 100). PLAYER_SPEED * 1s = 120px movement would push y below 0 (100-120=-20), triggering bounds clamp and causing assertion failure
- **Fix:** Introduced SAFE_X=500, SAFE_Y=500 constants in tests — far from all world bounds — and updated basic movement + diagonal tests to use them
- **Files modified:** packages/ui/src/game/__tests__/PlayerInput.test.ts
- **Verification:** All 32 tests pass after fix
- **Committed in:** 38b7512 (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug in test starting positions)
**Impact on plan:** Required fix for test correctness — no scope creep.

## Issues Encountered
- 3 pre-existing test failures in eventsSlice, approvalsSlice, and ApprovalInbox (unrelated to this plan — logged in deferred-items.md). These existed before 16-01 and are scoped out.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Player moves with WASD/arrow keys at 120 px/s; diagonals correctly normalised
- Camera follows player position each frame
- PlayerInput module ready for reuse by click-to-teleport (16-02) which can set player.x/y directly
- Ready to proceed to 16-02: click-to-teleport

---
*Phase: 16-player-controls*
*Completed: 2026-04-11*

## Self-Check: PASSED

All files found and all commits verified.
