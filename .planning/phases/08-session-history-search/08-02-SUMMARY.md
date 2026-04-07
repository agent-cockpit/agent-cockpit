---
phase: 08-session-history-search
plan: "02"
subsystem: api, ui, store
tags: [rest-endpoints, zustand, react-router, history, search, sessions]

dependency_graph:
  requires:
    - phase: 08-01
      provides: searchAll, getAllSessions, getSessionSummary query functions and FTS5 infrastructure
  provides:
    - GET /api/search?q= endpoint returning SearchResult[]
    - GET /api/sessions endpoint returning SessionSummary[]
    - GET /api/sessions/:id/summary endpoint returning SessionSummary or 404
    - HistorySlice in Zustand store (historySessions, historyMode, compareSelectionIds, bulkApplySessions, setHistoryMode, toggleCompareSelection)
    - /history route in React Router pointing to HistoryPage
    - HistoryPage placeholder component
  affects:
    - 08-03

tech-stack:
  added: []
  patterns:
    - "Three new REST routes follow the existing pattern (regex match → handler → res.writeHead + res.end JSON)"
    - "Route ordering: summary (/sessions/:id/summary) before list (/sessions) to prevent URL collision"
    - "HistorySlice: SessionSummary defined locally in UI store to avoid cross-package daemon import"
    - "toggleCompareSelection enforces max-2 selection with sliding window (replace oldest)"

key-files:
  created:
    - packages/ui/src/pages/HistoryPage.tsx
  modified:
    - packages/daemon/src/ws/server.ts
    - packages/daemon/src/__tests__/history-endpoints.test.ts
    - packages/daemon/src/__tests__/launch-session.test.ts
    - packages/ui/src/store/index.ts
    - packages/ui/src/router.tsx

key-decisions:
  - "SessionSummary interface defined locally in UI store — avoids cross-package import from daemon, keeps UI package self-contained"
  - "GET /api/sessions/:id/summary registered before GET /api/sessions to prevent URL collision (more specific regex first)"
  - "toggleCompareSelection sliding window: if 2 already selected, drop oldest (index 0) and add new — limits compare UI to exactly 2 sessions"
  - "launch-session.test.ts updated: GET /api/sessions placeholder test expecting 404 updated to 200 after endpoint addition (Rule 1 auto-fix)"

patterns-established:
  - "URL collision prevention: always register more-specific routes before catch-all routes in the httpServer request handler"

requirements-completed: [HIST-01, HIST-02, COMP-01]

duration: 2min
completed: 2026-04-07
---

# Phase 8 Plan 2: REST Endpoints + Zustand HistorySlice + /history Route Summary

**Three daemon REST endpoints (search, sessions list, session summary) wired to Plan 01 query functions, HistorySlice added to Zustand store with compareSelectionIds sliding-window logic, and /history route registered in React Router.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-07T09:42:25Z
- **Completed:** 2026-04-07T09:45:15Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Three new REST endpoints in server.ts consuming Plan 01 query exports (searchAll, getAllSessions, getSessionSummary)
- 6 HTTP endpoint tests added to history-endpoints.test.ts covering all behaviors including CORS headers and 404 for unknown session
- HistorySlice added to AppStore with historySessions map, historyMode flag, compareSelectionIds array, and all four action functions
- /history route registered in React Router with lazy HistoryPage import; HistoryPage placeholder stub created

## Task Commits

1. **Task 1: Three REST endpoints in server.ts** - `254aa13` (feat)
2. **Task 2: HistorySlice in Zustand store + /history route** - `2fd298b` (feat)

## Files Created/Modified
- `packages/daemon/src/ws/server.ts` - Added /api/search, /api/sessions/:id/summary, /api/sessions handlers
- `packages/daemon/src/__tests__/history-endpoints.test.ts` - Added HTTP test setup (beforeEach/afterEach with real server) and 6 HTTP endpoint tests
- `packages/daemon/src/__tests__/launch-session.test.ts` - Updated placeholder test expecting 404 to expect 200
- `packages/ui/src/store/index.ts` - Added SessionSummary interface + HistorySlice type + implementation
- `packages/ui/src/router.tsx` - Added /history route with lazy HistoryPage import
- `packages/ui/src/pages/HistoryPage.tsx` - Created placeholder component returning `<div data-testid="history-page">History</div>`

## Decisions Made
- SessionSummary defined locally in UI store (not imported from daemon) — avoids cross-package type dependency
- Route ordering enforced: summary endpoint (/sessions/:id/summary) registered before list endpoint (/sessions) to prevent URL collision
- toggleCompareSelection max-2 sliding window: when 2 selections exist and a 3rd is toggled, replaces index 0 (oldest) with new ID

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated stale test expectation in launch-session.test.ts**
- **Found during:** Task 1 (implementing GET /api/sessions endpoint)
- **Issue:** `launch-session.test.ts` had `it('GET /api/sessions returns 404')` — correct before this plan added the endpoint, but now fails because /api/sessions returns 200
- **Fix:** Updated test description and expectation from 404 to 200
- **Files modified:** `packages/daemon/src/__tests__/launch-session.test.ts`
- **Verification:** All 128 daemon tests pass after fix
- **Committed in:** 254aa13 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - stale test expectation)
**Impact on plan:** Necessary correctness fix. No scope creep.

## Issues Encountered
None beyond the stale test auto-fix above.

## Next Phase Readiness
- Plan 03 (HistoryPage full implementation) has all prerequisites ready:
  - Three daemon endpoints return correct JSON at correct routes
  - Zustand store exports historyMode, compareSelectionIds, bulkApplySessions, toggleCompareSelection
  - /history route resolves to HistoryPage

---
*Phase: 08-session-history-search*
*Completed: 2026-04-07*
