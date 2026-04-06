---
phase: 04-codex-adapter
plan: 01
subsystem: database, testing
tags: [sqlite, vitest, tdd, codex, better-sqlite3]

# Dependency graph
requires:
  - phase: 01-daemon-core
    provides: openDatabase, SQLite schema pattern, vitest test infrastructure
  - phase: 02-claude-adapter-approval-foundation
    provides: NormalizedEvent types, adapter pattern reference (hookParser.ts)
provides:
  - codex_sessions SQLite DDL for session resume across daemon restarts
  - Failing test stubs for codexParser (8 cases) and codexAdapter (4 cases)
  - RED state TDD foundation for plans 02 and 03
affects: [04-02, 04-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Wave 0 TDD stub pattern: create test files importing non-existent modules so CI fails RED before implementation

key-files:
  created:
    - packages/daemon/src/adapters/codex/__tests__/codexParser.test.ts
    - packages/daemon/src/adapters/codex/__tests__/codexAdapter.test.ts
  modified:
    - packages/daemon/src/db/database.ts

key-decisions:
  - "codex_sessions uses session_id (our UUID) as PK and thread_id (Codex thr_xxx) as separate column — maps Codex thread identity to our session namespace"
  - "Test stubs use it.todo() syntax with void import references — lets TypeScript compile while module-not-found causes RED failure at collection time"

patterns-established:
  - "Wave 0 stub pattern: write test files that import non-existent modules; vitest fails at collection time (Cannot find module), satisfying RED phase without needing placeholder implementations"

requirements-completed: [DAEMON-05]

# Metrics
duration: 4min
completed: 2026-04-05
---

# Phase 4 Plan 01: Foundation — codex_sessions DDL and Failing Test Stubs Summary

**SQLite codex_sessions table added to schema + 12 it.todo stubs covering all Codex JSONL-to-NormalizedEvent mappings ready for Wave 1 implementation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-05T10:06:37Z
- **Completed:** 2026-04-05T10:09:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `codex_sessions` DDL to `openDatabase()` schema block — enables session resume via `session_id` (UUID) → `thread_id` (Codex thr_xxx) mapping
- Created `codexParser.test.ts` with 8 `it.todo` stubs covering all JSONL method → NormalizedEvent mappings: turn/started, item/started (command + file), requestApproval (command + file), turn/completed, malformed JSON
- Created `codexAdapter.test.ts` with 4 `it.todo` stubs covering approval reply, approval deny, session resume, and process guard behaviors
- All 6 original daemon test files remain green (56 passing tests); 2 new files fail RED at collection time

## Task Commits

Each task was committed atomically:

1. **Task 1: Add codex_sessions table DDL to database.ts** - `9a5b6da` (feat)
2. **Task 2: Write failing test stubs for codexParser and codexAdapter** - `796ef5c` (test)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `packages/daemon/src/db/database.ts` - Added codex_sessions CREATE TABLE IF NOT EXISTS after always_allow_rules
- `packages/daemon/src/adapters/codex/__tests__/codexParser.test.ts` - 8 it.todo stubs + fixture JSONL strings inline
- `packages/daemon/src/adapters/codex/__tests__/codexAdapter.test.ts` - 4 it.todo stubs for CodexAdapter class behavior

## Decisions Made
- Test stubs use `it.todo()` with `void importedSymbol` references — TypeScript compiles cleanly but vitest fails at collection time with "Cannot find module" which satisfies the RED requirement without needing placeholder stub files
- `codex_sessions` column naming follows existing schema conventions: snake_case, TEXT for identifiers, TEXT NOT NULL for required fields

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Wave 1 ready: codexParser.ts can be implemented against the 8 test stubs in plan 02
- Wave 1 ready: codexAdapter.ts can be implemented against the 4 test stubs in plan 03
- DB schema ready: codex_sessions table available for adapter to persist/resume sessions

---
*Phase: 04-codex-adapter*
*Completed: 2026-04-05*

## Self-Check: PASSED
- packages/daemon/src/db/database.ts: FOUND
- packages/daemon/src/adapters/codex/__tests__/codexParser.test.ts: FOUND
- packages/daemon/src/adapters/codex/__tests__/codexAdapter.test.ts: FOUND
- Commit 9a5b6da: FOUND
- Commit 796ef5c: FOUND
