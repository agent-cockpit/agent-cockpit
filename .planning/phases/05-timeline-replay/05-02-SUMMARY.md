---
phase: 05-timeline-replay
plan: 02
subsystem: ui
tags: [zustand, typescript, eventsSlice, store, timeline]

# Dependency graph
requires:
  - phase: 03-browser-ui-shell-session-management
    provides: Zustand AppStore with sessionsSlice pattern that eventsSlice mirrors
provides:
  - eventsSlice.ts with applyEventToEvents reducer (dedup-safe) and EMPTY_EVENTS constant
  - bulkApplyEvents action for REST hydration
  - AppStore.events: Record<string, NormalizedEvent[]> accumulation per session
  - applyEvent in store now updates both sessions and events slices atomically
affects: [05-03-timeline-panel, 05-04-replay]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure reducer slice pattern: eventsSlice mirrors sessionsSlice shape (Pick<AppStore, 'events'> in/out)"
    - "EMPTY_EVENTS module-level constant prevents inline [] causing React infinite re-render on selectors"
    - "Dedup guard on sequenceNumber: skip if already present, always-append if sequenceNumber absent"

key-files:
  created:
    - packages/ui/src/store/eventsSlice.ts
    - packages/ui/src/__tests__/eventsSlice.test.ts
  modified:
    - packages/ui/src/store/index.ts

key-decisions:
  - "EMPTY_EVENTS exported from eventsSlice (not inline []) — component selectors using ?? EMPTY_EVENTS get stable reference, preventing infinite re-render loops"
  - "bulkApplyEvents replaces entire array for sessionId — designed for REST hydration which provides canonical ordered set (no dedup overhead needed)"
  - "applyEventToEvents dedup uses sequenceNumber only when present; events without sequenceNumber always append (WS events before daemon assigns sequence)"

patterns-established:
  - "Slice pattern: pure function (state, event) => state with Pick<AppStore, 'slice-key'> types — testable without store instantiation"
  - "Store init: new slice fields added inside create() alongside existing slices, AppStore union type extended"

requirements-completed: [TIMELINE-01, TIMELINE-02, TIMELINE-03]

# Metrics
duration: 2min
completed: 2026-04-06
---

# Phase 5 Plan 02: Events Slice Summary

**Zustand eventsSlice accumulating NormalizedEvents per session with sequenceNumber-based dedup and EMPTY_EVENTS stable-reference guard**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-06T16:06:47Z
- **Completed:** 2026-04-06T16:08:08Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `eventsSlice.ts` implements `applyEventToEvents` pure reducer with dedup on sequenceNumber and `getSessionEvents` helper
- `EMPTY_EVENTS` module-level constant exported — prevents selector `?? []` from creating new references on every render
- `AppStore` extended with `EventsSlice` interface (`events` + `bulkApplyEvents`); `applyEvent` now atomically updates both sessions and events slices

## Task Commits

Each task was committed atomically:

1. **Task 1: TDD eventsSlice reducer** - `dd61793` (feat)
2. **Task 2: Wire eventsSlice into AppStore** - `626ae8d` (feat)

**Plan metadata:** (docs commit follows)

_Note: Task 1 followed full TDD cycle — RED (empty placeholder, 6 failures) then GREEN (implementation, 6 passes)_

## Files Created/Modified
- `packages/ui/src/store/eventsSlice.ts` — Pure reducer: applyEventToEvents, getSessionEvents, EMPTY_EVENTS export
- `packages/ui/src/__tests__/eventsSlice.test.ts` — 6 unit tests covering append, dedup, no-seq, immutability, session isolation
- `packages/ui/src/store/index.ts` — EventsSlice interface added, AppStore union extended, applyEvent now calls both reducers, bulkApplyEvents and events: {} added

## Decisions Made
- `EMPTY_EVENTS` exported constant instead of inline `[]` — ensures `useStore(s => s.events[id] ?? EMPTY_EVENTS)` returns stable reference, avoiding infinite re-render (same pattern as `useRef` cache decision in Phase 3)
- `bulkApplyEvents` replaces the entire array for a session — correct for REST hydration where full canonical ordered set is provided
- Dedup guard on `sequenceNumber` only; events without it always append (handles WS events emitted before SQLite assigns sequence)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TDD cycle ran cleanly. RED confirmed all 6 tests failing, GREEN confirmed all 6 passing. Full 46-test suite passes with no regressions.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `AppStore.events` is populated by every `applyEvent` call (live WS) and by `bulkApplyEvents` (REST hydration)
- `TimelinePanel` can read `useStore(s => s.events[sessionId] ?? EMPTY_EVENTS)` with stable reference
- Plan 05-03 (TimelinePanel component) can proceed immediately

---
*Phase: 05-timeline-replay*
*Completed: 2026-04-06*
