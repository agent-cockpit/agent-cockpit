---
phase: 09-office-mode
plan: "03"
subsystem: ui
tags: [office-mode, dnd-kit, react-router, zustand, tdd, navigation]
dependency_graph:
  requires:
    - "09-01: useLocalStorage hook, deriveAgentState, AgentAnimState"
    - "09-02: AgentSprite component with dnd-kit useDraggable"
  provides:
    - "OfficePage — full-viewport DndContext canvas with active session sprites"
    - "/office lazy route in React Router v7"
    - "Office NavLink in OpsLayout header"
  affects:
    - "All future phases: Office mode is the last feature in v1.0"
tech-stack:
  added: []
  patterns:
    - "vi.hoisted() for mock factories that need variables shared with test assertions"
    - "Object.assign pattern to attach getState() to a vi.fn() mock (Zustand static method)"

key-files:
  created:
    - packages/ui/src/pages/OfficePage.tsx
    - packages/ui/src/__tests__/OfficePage.test.tsx
  modified:
    - packages/ui/src/router.tsx
    - packages/ui/src/components/layout/OpsLayout.tsx

key-decisions:
  - "vi.hoisted() required when mock factory closures reference variables declared in test file scope — avoids hoisting temporal dead zone errors"
  - "useStore.getState() mock attached via Object.assign on the mock function — matches Zustand's static method pattern"

patterns-established:
  - "OfficePage filters sessions with status==='active' inline in useStore selector to avoid rendering ended/error sessions"
  - "DragEndEvent handler reads position from positions state (not live transform) before computing new absolute position — prevents accumulation errors on repeated drags"

requirements-completed: [OFFICE-01, OFFICE-02, OFFICE-03, OFFICE-04]

duration: 1min
completed: 2026-04-07
---

# Phase 9 Plan 3: OfficePage Canvas + Route + Nav Summary

**DndContext canvas wiring all active sessions as draggable AgentSprites with localStorage position persistence, /office React Router v7 lazy route, and Office NavLink in OpsLayout header**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-07T14:24:35Z
- **Completed:** 2026-04-07T14:25:50Z
- **Tasks:** 2 auto + 1 human checkpoint (awaiting)
- **Files modified:** 4

## Accomplishments

- OfficePage.tsx renders active sessions as AgentSprites in a full-viewport DndContext canvas
- Position persistence via useLocalStorage('cockpit.office.positions', {}) with default grid layout (COLS=5, CELL=96)
- Click on sprite selects session and navigates to /session/{id}/approvals
- /office lazy route added to React Router v7 alongside existing routes
- Office NavLink added to OpsLayout header with same active-state styling as History

## Task Commits

1. **Task 1: OfficePage — DndContext canvas with position persistence and click navigation** - `841c30e` (feat)
2. **Task 2: Wire /office route and add Office NavLink to OpsLayout** - `663d726` (feat)

## Files Created/Modified

- `packages/ui/src/pages/OfficePage.tsx` — Full-viewport DndContext canvas rendering all active AgentSprite instances; drag position update via setPositions functional updater
- `packages/ui/src/__tests__/OfficePage.test.tsx` — 7 RTL tests: canvas render, active-only filter, localStorage position reads, default grid positions, click navigation
- `packages/ui/src/router.tsx` — Added /office lazy route pointing to OfficePage after /history entry
- `packages/ui/src/components/layout/OpsLayout.tsx` — Added Office NavLink with identical className logic as History NavLink

## Decisions Made

- **vi.hoisted() for mock factory variables:** `useStore.getState` needed to be a callable attached to the mock function. Using `vi.hoisted()` creates variables before vi.mock hoisting so the factory closure works correctly.
- **Object.assign pattern for Zustand static method mock:** `Object.assign(vi.fn(...), { getState: vi.fn(...) })` cleanly attaches `getState` to the mock function without TypeScript errors.

## Deviations from Plan

None — plan executed exactly as written. The `vi.hoisted()` pattern was needed to make the mock work (implementation detail, not a plan deviation).

## Issues Encountered

Minor: Initial `useStore` mock approach caused "Cannot access before initialization" ReferenceError due to vi.mock hoisting. Resolved by using `vi.hoisted()` to pre-declare mock variables — standard Vitest pattern for this scenario.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

All four OFFICE requirements (OFFICE-01 through OFFICE-04) are implemented:
- OFFICE-01: Full-viewport canvas with active session sprites
- OFFICE-02: AgentHoverCard with 7 required fields (built in Plan 02)
- OFFICE-03: Click-to-navigate to session approvals
- OFFICE-04: Drag position persistence via localStorage

**Awaiting human verification checkpoint** (Task 3): Browser test of /office route, sprite animation, hover card, drag-and-drop persistence, and navigation. Performance check for 45fps with 10 concurrent sessions.

---
*Phase: 09-office-mode*
*Completed: 2026-04-07*
