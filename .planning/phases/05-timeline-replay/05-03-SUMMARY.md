---
phase: 05-timeline-replay
plan: 03
subsystem: ui
tags: [react, zustand, react-router, testing-library, vitest, tdd, timeline]

# Dependency graph
requires:
  - phase: 05-timeline-replay
    plan: 01
    provides: GET /api/sessions/:sessionId/events REST endpoint returning JSON array of NormalizedEvent
  - phase: 05-timeline-replay
    plan: 02
    provides: eventsSlice with AppStore.events, bulkApplyEvents, EMPTY_EVENTS stable reference

provides:
  - Full interactive TimelinePanel replacing stub: ordered event list, filter chips, jump-to, inline detail
  - EVENT_TYPE_LABELS map for human-readable event type display
  - InlineDetail component handling tool_call, file_change, approval_request, and generic events
  - 17 RTL tests covering all four TIMELINE requirements (TIMELINE-01 through TIMELINE-04)

affects: [05-04-replay, any future panel that needs event display patterns]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "data-testid='timeline-list' on list container allows within() scoping to avoid chip-label vs row-label conflicts in RTL"
    - "Filter chip + event row share same label text — scope assertions to list container with within()"
    - "jumpNext falls back to first target when jumpIndex is at end of list (circular-style navigation)"
    - "useEffect deps intentionally exclude events/bulkApplyEvents — fetch runs once on mount only"

key-files:
  created:
    - packages/ui/src/__tests__/TimelinePanel.test.tsx
  modified:
    - packages/ui/src/components/panels/TimelinePanel.tsx

key-decisions:
  - "data-testid='timeline-list' added to list container — RTL within() scoping required because filter chips use same text as event row labels"
  - "ToolCallEvent uses 'input' field (not 'toolInput') matching actual shared schema — InlineDetail renders event.input via JSON.stringify"
  - "jumpNext falls back to first target when jumpIndex has passed all targets — ensures button always scrolls when targets exist"
  - "Filter chips and event rows share text labels — tests use within(list) scoping rather than screen.getByText() to avoid multiple-match errors"

patterns-established:
  - "RTL pattern: use within(screen.getByTestId('container')) to scope queries in components with repeated text labels"
  - "TDD cycle: RED with stub (returns null), GREEN with full implementation — all 17 tests confirmed failing before implementation"

requirements-completed: [TIMELINE-01, TIMELINE-02, TIMELINE-03, TIMELINE-04]

# Metrics
duration: 3min
completed: 2026-04-06
---

# Phase 5 Plan 03: TimelinePanel — Full Interactive Timeline Summary

**React TimelinePanel with filter chips, jump-to-approval/file-change navigation, click-to-expand inline detail, and REST hydration on mount — 17 RTL tests covering all four TIMELINE requirements**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-06T16:11:31Z
- **Completed:** 2026-04-06T16:14:45Z
- **Tasks:** 1 (TDD)
- **Files modified:** 2

## Accomplishments
- Replaced stub with fully interactive TimelinePanel: ordered event list sorted by sequenceNumber, filter chips dynamically generated from present event types, jump-to-next-approval/file-change with scrollIntoView, click-to-expand inline detail with type-specific fields
- InlineDetail renders `toolName` + JSON-stringified `input` for tool_call; `filePath` + `changeType` + optional `diff` for file_change; `proposedAction` + `riskLevel` + `whyRisky` for approval_request
- REST hydration via `useEffect` on mount calls `GET /api/sessions/:sessionId/events` only when `events[sessionId]` is empty, then calls `bulkApplyEvents` — skips fetch when store already populated
- 17 RTL tests pass: 5 for TIMELINE-01 (ordered list + fetch), 4 for TIMELINE-02 (jump-to), 3 for TIMELINE-03 (filter), 5 for TIMELINE-04 (inline detail)

## Task Commits

Each task was committed atomically:

1. **Task 1: TDD — TimelinePanel (RED + GREEN cycle)** - `c51d75e` (feat)

## Files Created/Modified
- `packages/ui/src/__tests__/TimelinePanel.test.tsx` — 17 RTL tests covering all four TIMELINE requirements; uses `within()` scoping on `data-testid='timeline-list'`
- `packages/ui/src/components/panels/TimelinePanel.tsx` — Full interactive timeline replacing stub; EVENT_TYPE_LABELS map, InlineDetail component, filter/jump-to/hydration logic

## Decisions Made
- Added `data-testid="timeline-list"` to the timeline list container in the implementation so RTL `within()` can scope event-row queries away from filter chip labels (both share the same text labels like "Tool Call")
- `ToolCallEvent` schema uses `input` (not `toolInput` as the plan suggested) — InlineDetail renders `event.input`; matched actual `@cockpit/shared` schema
- `jumpNext` falls back to first target when `jumpIndex` is past all targets — ensures buttons always work when targets exist and are reachable from any position

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] InlineDetail uses `event.input` not `event.toolInput`**
- **Found during:** Task 1 (GREEN phase — adapting plan pseudocode to actual schema)
- **Issue:** Plan pseudocode used `event.toolInput` but `@cockpit/shared` ToolCallEvent schema has `input` field
- **Fix:** InlineDetail renders `event.input` via `JSON.stringify`
- **Files modified:** `packages/ui/src/components/panels/TimelinePanel.tsx`
- **Verification:** `tool_call inline detail shows toolName and JSON-stringified toolInput` test passes
- **Committed in:** `c51d75e` (Task 1 commit)

**2. [Rule 1 - Bug] Test query scoping with `within()` to resolve chip-vs-row label conflicts**
- **Found during:** Task 1 (GREEN phase — first test run with 10 failures)
- **Issue:** Filter chip buttons and event row labels share the same text ("Tool Call", "File Change", etc.), causing `getByText()` to throw "Found multiple elements" errors
- **Fix:** Added `data-testid="timeline-list"` to the list container; rewrote affected tests to use `within(screen.getByTestId('timeline-list'))` for row-level assertions
- **Files modified:** `packages/ui/src/__tests__/TimelinePanel.test.tsx`, `packages/ui/src/components/panels/TimelinePanel.tsx`
- **Verification:** All 17 tests pass; no "Found multiple elements" errors
- **Committed in:** `c51d75e` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs in plan pseudocode vs actual schema/RTL behavior)
**Impact on plan:** Both fixes necessary for tests to compile and pass. No scope creep.

## Issues Encountered
- `react-router-dom` is not installed — project uses `react-router` v7 (unified package). Test imports corrected from `react-router-dom` to `react-router`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All four TIMELINE requirements (TIMELINE-01 through TIMELINE-04) fully implemented and tested
- TimelinePanel available at route `/session/:sessionId/timeline` via lazy load in router
- Phase 5 complete — ready for Phase 6 or any remaining work

---
*Phase: 05-timeline-replay*
*Completed: 2026-04-06*

## Self-Check: PASSED
- `packages/ui/src/__tests__/TimelinePanel.test.tsx` exists on disk
- `packages/ui/src/components/panels/TimelinePanel.tsx` exists on disk (full implementation, not stub)
- Commit `c51d75e` confirmed in git log
- 17 tests pass, 81 daemon tests pass, 63 UI tests pass — no regressions
