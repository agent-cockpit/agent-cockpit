---
phase: 05-timeline-replay
plan: 01
subsystem: api
tags: [sqlite, better-sqlite3, http, rest, cors, tdd, vitest]

# Dependency graph
requires:
  - phase: 01-daemon-core
    provides: persistEvent, getEventsSince, openDatabase, events table schema with idx_events_session index
  - phase: 03-browser-ui-shell-session-management
    provides: POST /api/sessions HTTP route structure in ws/server.ts
provides:
  - getEventsBySession(db, sessionId) exported from packages/daemon/src/db/queries.ts
  - GET /api/sessions/:sessionId/events HTTP route in ws/server.ts returning JSON array of NormalizedEvent
  - CORS Access-Control-Allow-Methods header now includes GET
affects: [05-timeline-replay, TimelinePanel hydration, ui event replay]

# Tech tracking
tech-stack:
  added: []
  patterns: [TDD red-green for REST endpoint + SQLite query pair, eventsMatch regex route matching pattern]

key-files:
  created: []
  modified:
    - packages/daemon/src/db/queries.ts
    - packages/daemon/src/ws/server.ts
    - packages/daemon/src/__tests__/database.test.ts
    - packages/daemon/src/__tests__/launch-session.test.ts

key-decisions:
  - "getEventsBySession selects payload + sequence_number, maps sequence_number to sequenceNumber — same pattern as getEventsSince for consistency"
  - "eventsMatch regex /^\\/api\\/sessions\\/([^/]+)\\/events$/ placed before POST handler to avoid URL collision and allow future sub-routes"
  - "GET /api/sessions/unknown-id/events returns 200 + empty array (not 404) — consistent with REST convention for collection endpoints"

patterns-established:
  - "REST route added to ws/server.ts request handler before fallthrough 404 — keep GET routes above POST routes"
  - "httpGetJson test helper returns status + body + headers — reusable pattern for future HTTP integration tests"

requirements-completed: [TIMELINE-01]

# Metrics
duration: 2min
completed: 2026-04-06
---

# Phase 5 Plan 01: Timeline Replay — Events Endpoint Summary

**SQLite `getEventsBySession` query + `GET /api/sessions/:sessionId/events` HTTP endpoint with CORS GET support, enabling TimelinePanel to hydrate historical events**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-06T13:06:43Z
- **Completed:** 2026-04-06T13:08:43Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Implemented `getEventsBySession(db, sessionId)` in queries.ts, selecting events by session ordered by `sequence_number ASC` and merging `sequenceNumber` into the returned objects
- Added `GET /api/sessions/:sessionId/events` REST route in ws/server.ts using regex match (`eventsMatch`) returning JSON array
- Fixed CORS `Access-Control-Allow-Methods` header from `'POST, OPTIONS'` to `'GET, POST, OPTIONS'` so browser fetches are not blocked
- Added 5 unit tests for `getEventsBySession` and 5 integration tests for the HTTP endpoint; all 81 daemon tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: TDD — getEventsBySession query** - `1acac90` (feat)
2. **Task 2: TDD — GET /api/sessions/:sessionId/events endpoint + CORS fix** - `02a6459` (feat)

## Files Created/Modified
- `packages/daemon/src/db/queries.ts` - Added `getEventsBySession` export
- `packages/daemon/src/ws/server.ts` - Added GET route handler + CORS GET fix, imported `getEventsBySession`
- `packages/daemon/src/__tests__/database.test.ts` - Added `getEventsBySession` import + 5 unit tests
- `packages/daemon/src/__tests__/launch-session.test.ts` - Added `httpGetJson` helper, `makeSessionEvent` helper, `persistEvent` import, 5 integration tests

## Decisions Made
- `getEventsBySession` returns 200 + empty array for unknown sessionId (not 404) — consistent with REST collection semantics
- `eventsMatch` regex placed before the POST handler to avoid any future URL collision
- Used same `payload + sequence_number` select + map pattern as `getEventsSince` for consistency across query functions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `GET /api/sessions/:sessionId/events` endpoint is live and tested
- TimelinePanel can now fetch historical events via `fetch('/api/sessions/:sessionId/events')`
- All 81 daemon tests green; no regressions in ws-catchup, approval-queue, hook-server, or launch-session suites
- Ready for Plan 05-02: TimelinePanel UI component

---
*Phase: 05-timeline-replay*
*Completed: 2026-04-06*

## Self-Check: PASSED
- All 4 modified files exist on disk
- Commit `1acac90` (Task 1) confirmed in git log
- Commit `02a6459` (Task 2) confirmed in git log
