---
phase: 15-game-engine-foundation
plan: "03"
subsystem: ui
tags: [canvas, game-engine, sprites, dnd-kit-removal, react-canvas-hybrid]

# Dependency graph
requires:
  - phase: 15-game-engine-foundation-01
    provides: GameEngine base class, canvas mount in OfficePage
  - phase: 15-game-engine-foundation-02
    provides: Camera module, GameState module, ResizeObserver wiring

provides:
  - drawAgentSprite() canvas blit function replacing React AgentSprite component
  - gameState.npcs seeding from sessions array with grid layout
  - Canvas click handler with hit-test against gameState.npcs calling selectSession
  - Full DnD removal from OfficePage (dnd-kit no longer used)
  - Canvas-only sprite rendering (no React divs for agents)

affects: [15-04, 15-05, phase-16-player-controls, phase-17-npc-behavior]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Canvas blit via drawAgentSprite(ctx, session, lastEvent, position, imageCache)"
    - "imageCache Map<string, HTMLImageElement> for sprite sheet reuse across frames"
    - "gameState.npcs as source of truth for NPC world positions"
    - "Canvas click hit-test: clickX = clientX - rect.left + camera.x"
    - "useStore.getState() (not hook) inside rAF render loop for live data"

key-files:
  created: []
  modified:
    - packages/ui/src/components/office/AgentSprite.tsx
    - packages/ui/src/pages/OfficePage.tsx
    - packages/ui/src/game/GameState.ts
    - packages/ui/src/pages/__tests__/OfficePage.test.tsx
    - packages/ui/src/__tests__/OfficePage.test.tsx
    - packages/ui/src/game/__tests__/GameState.test.ts
    - packages/ui/src/__tests__/AgentSprite.test.tsx

key-decisions:
  - "Static blit only in Phase 15 (col=0 always) — animation frame stepping deferred to Phase 20"
  - "DnD (@dnd-kit) removed from OfficePage and AgentSprite; package stays in package.json (used elsewhere)"
  - "gameState.npcs seeding cleans up stale entries — sessions not in useActiveSessions() are deleted"
  - "AgentSprite.tsx no longer exports a React component — only drawAgentSprite() function"
  - "GameState.camera typed as CameraState (adds viewportW/viewportH); synced in ResizeObserver"

patterns-established:
  - "Canvas draw functions receive imageCache by reference — one cache per component lifetime"
  - "Hit-test loop: world coords = clientX - rect.left + camera.x, compare to gameState.npcs entries"
  - "useStore.getState() inside render() for zero-hook live reads in rAF context"

requirements-completed:
  - game-loop
  - gamestate-store
  - camera-system

# Metrics
duration: 8min
completed: 2026-04-10
---

# Phase 15 Plan 03: Sprite Canvas Migration Summary

**Canvas-based agent sprite blitting via drawAgentSprite() with dnd-kit removal, gameState.npcs seeding, and hit-test click handler replacing all React AgentSprite divs**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-10T18:43:27Z
- **Completed:** 2026-04-10T18:51:30Z
- **Tasks:** 3 (+ checkpoint awaiting verification)
- **Files modified:** 7

## Accomplishments

- Replaced the React `AgentSprite` component (with dnd-kit, HoverCard, frame animation) with `drawAgentSprite()` — a pure canvas blit function using `imageCache` for sprite sheet reuse
- Removed all `@dnd-kit/core` imports, `DndContext`, drag state, and localStorage positions from `OfficePage.tsx`; canvas is now the sole rendering layer for agents
- Added `gameState.npcs` seeding effect that places sessions on a grid (CELL=96, COLS=5) and cleans up stale entries; added canvas click hit-test that calls `selectSession()` via `useStore.getState()`

## Task Commits

1. **Task 1: Refactor AgentSprite** - `e0747c8` (feat)
2. **Task 2: Update OfficePage** - `8e839cc` (feat)
3. **Task 3: Update OfficePage tests** - `36b5d3b` (test)

## Files Created/Modified

- `packages/ui/src/components/office/AgentSprite.tsx` — Replaced React component with `drawAgentSprite()` canvas function + `DrawAgentSpriteOptions` interface
- `packages/ui/src/pages/OfficePage.tsx` — Removed DnD, added imageCache, npcs seeding effect, drawAgentSprite in render(), canvas click handler
- `packages/ui/src/game/GameState.ts` — Camera type changed to `CameraState` (adds `viewportW`/`viewportH`); synced in ResizeObserver
- `packages/ui/src/pages/__tests__/OfficePage.test.tsx` — Added: no-DnD, no-sprite-div, canvas click tests (8 tests, all green)
- `packages/ui/src/__tests__/OfficePage.test.tsx` — Replaced legacy React sprite tests with canvas/NPC equivalents (11 tests, all green)
- `packages/ui/src/game/__tests__/GameState.test.ts` — Updated camera initial value test for `viewportW`/`viewportH`
- `packages/ui/src/__tests__/AgentSprite.test.tsx` — Replaced React component tests with `drawAgentSprite()` canvas function tests

## Decisions Made

- Static blit only (col=0) in Phase 15 — animation frame stepping deferred to Phase 20
- `AgentSprite.tsx` no longer exports a React component, only `drawAgentSprite()` — callers must update
- `@dnd-kit` package not removed from `package.json` (may be used elsewhere); only the imports in these files are removed
- `useStore.getState()` used inside `render()` (called in rAF) to avoid React hook rules violation
- `viewportW`/`viewportH` added to `GameState.camera` to match `CameraState` interface; initialized to 0 and synced by ResizeObserver

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed GameState.camera missing viewportW/viewportH**
- **Found during:** Task 2 (OfficePage update)
- **Issue:** `gameState.camera` was typed with 4 fields (`x, y, targetX, targetY`) but `CameraState` requires `viewportW`/`viewportH` — TypeScript error on `updateCamera()` call
- **Fix:** Imported `CameraState` type in `GameState.ts`, added `viewportW: 0, viewportH: 0` to initial state, synced values in OfficePage's ResizeObserver
- **Files modified:** `packages/ui/src/game/GameState.ts`, `packages/ui/src/pages/OfficePage.tsx`
- **Verification:** `npx tsc --noEmit` passes (excluding pre-existing errors)
- **Committed in:** `8e839cc` (Task 2 commit)

**2. [Rule 1 - Bug] Updated legacy AgentSprite.test.tsx for new canvas API**
- **Found during:** Task 1 (AgentSprite refactor)
- **Issue:** `src/__tests__/AgentSprite.test.tsx` imported and tested the old React `AgentSprite` component (now removed); would cause test failures
- **Fix:** Rewrote test file to test `drawAgentSprite()` canvas function — imageCache behavior, drawImage call arguments, sprite sheet URL derivation
- **Files modified:** `packages/ui/src/__tests__/AgentSprite.test.tsx`
- **Verification:** All 6 new tests pass
- **Committed in:** `e0747c8` (Task 1 commit)

**3. [Rule 1 - Bug] Updated legacy OfficePage.test.tsx for canvas-only rendering**
- **Found during:** Task 3 (test update)
- **Issue:** `src/__tests__/OfficePage.test.tsx` had 8 tests expecting React AgentSprite divs, DnD context, localStorage positions — all invalid after this plan's changes
- **Fix:** Replaced with canvas-equivalent tests: no-DnD, no-sprite-divs, gameState.npcs seeding, canvas click hit-test
- **Files modified:** `packages/ui/src/__tests__/OfficePage.test.tsx`
- **Verification:** All 11 tests pass
- **Committed in:** `36b5d3b` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 - bug fixes)
**Impact on plan:** All auto-fixes necessary for correctness and test green-ness. No scope creep.

## Issues Encountered

- Canvas click test initially failed because the `gameState.npcs` seeding effect (triggered by `useActiveSessions()`) deleted pre-seeded test NPCs (since mock returned `[]`). Fixed by returning the test session from `useActiveSessions` mock so the cleanup logic preserved it.
- `vi.mock` factory hoisting caused `ReferenceError` when trying to reference `const` variables inside the factory. Fixed using `vi.hoisted()` for mocks needed in factory closures.
- 3 pre-existing test failures remain (`ApprovalInbox riskLevel`, `approvalsSlice unrelated event`, `eventsSlice dedup guard`) — confirmed pre-existing via `git stash`. Out of scope.

## Next Phase Readiness

- Canvas rendering architecture complete: Canvas is the game rendering layer, React is the UI overlay
- `drawAgentSprite()` is importable by any future game module needing NPC blitting
- `gameState.npcs` is the authoritative position store, ready for Phase 17 zone-based movement
- Click-to-popup flow works: canvas hit-test → `selectSession()` → `InstancePopupHub`
- Phase 16 (player controls) can render player character on canvas using same blit pattern

## Self-Check: PASSED

All files verified on disk:
- `packages/ui/src/components/office/AgentSprite.tsx` — FOUND
- `packages/ui/src/pages/OfficePage.tsx` — FOUND
- `.planning/phases/15-game-engine-foundation/15-03-SUMMARY.md` — FOUND

All commits verified:
- `e0747c8` feat(15-03): Task 1 — FOUND
- `8e839cc` feat(15-03): Task 2 — FOUND
- `36b5d3b` test(15-03): Task 3 — FOUND

---
*Phase: 15-game-engine-foundation*
*Completed: 2026-04-10*
