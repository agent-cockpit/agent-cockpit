---
phase: 01-daemon-core
plan: 02
subsystem: database
tags: [sqlite, better-sqlite3, wal, tdd, vitest, typescript]

# Dependency graph
requires:
  - phase: 01-01
    provides: "@cockpit/shared NormalizedEvent Zod schema and TypeScript type"
provides:
  - openDatabase() function with WAL mode, schema creation (events table + idx_events_session), checkpoint scheduling
  - persistEvent() using INTEGER PRIMARY KEY rowid as sequenceNumber
  - getEventsSince() returning events with sequence_number > N in ascending order
  - "@cockpit/daemon package with better-sqlite3 native addon"
affects:
  - 01-03 (ipc-server will call persistEvent and getEventsSince for catch-up replay)
  - All future phases that read or write events

# Tech tracking
tech-stack:
  added: [better-sqlite3@12.8.0, "@types/better-sqlite3@7.6.13", ws@8.18.3, "@types/ws@8.18.1"]
  patterns:
    - WAL mode enabled via pragma assert (throw on non-wal for file DBs)
    - INTEGER PRIMARY KEY without AUTOINCREMENT — rowid is sequenceNumber
    - Prepared statements via db.prepare().run() and db.prepare().all()
    - Checkpoint scheduling via setInterval + unref() so process can exit cleanly
    - pnpm onlyBuiltDependencies in pnpm-workspace.yaml for native addons

key-files:
  created:
    - packages/daemon/package.json
    - packages/daemon/tsconfig.json
    - packages/daemon/vitest.config.ts
    - packages/daemon/src/db/database.ts
    - packages/daemon/src/db/queries.ts
    - packages/daemon/src/__tests__/database.test.ts
    - .npmrc
    - .gitignore
  modified:
    - pnpm-workspace.yaml (added onlyBuiltDependencies)
    - pnpm-lock.yaml (added better-sqlite3, ws, related types)
    - package.json (fixed root test script: vitest run → vitest)

key-decisions:
  - "WAL mode assertion skipped for :memory: databases — SQLite in-memory always uses 'memory' journal mode; assertion only applies to file-based paths"
  - "WAL test uses os.tmpdir() temp file so the WAL assertion can actually be exercised"
  - "INTEGER PRIMARY KEY without AUTOINCREMENT — rowid recycles after deletion; acceptable for append-only event log"
  - "onlyBuiltDependencies added to pnpm-workspace.yaml to allow better-sqlite3 native build without interactive approval"

patterns-established:
  - "Native addon pattern: declare in onlyBuiltDependencies in pnpm-workspace.yaml, NOT in .npmrc enable-pre-post-scripts"
  - "DB module pattern: openDatabase returns Database.Database instance, callers pass it to query functions (no module-level singleton)"
  - "Temp file WAL test pattern: use fs.mkdtempSync + finally fs.rmSync for WAL mode tests needing real files"

requirements-completed: [DAEMON-02]

# Metrics
duration: 5min
completed: 2026-04-05
---

# Phase 1 Plan 02: SQLite Persistence Layer Summary

**better-sqlite3 persistence layer with WAL mode, rowid-based sequenceNumber, and prepared-statement wrappers (persistEvent, getEventsSince) — 11 TDD tests all passing**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-05T03:48:27Z
- **Completed:** 2026-04-05T03:53:50Z
- **Tasks:** 3 (scaffold, RED, GREEN)
- **Files modified:** 11

## Accomplishments
- @cockpit/daemon package created with better-sqlite3 native addon properly built via pnpm onlyBuiltDependencies
- openDatabase() enables WAL mode for file databases, creates events table with INTEGER PRIMARY KEY (no AUTOINCREMENT), and creates idx_events_session index
- persistEvent() inserts NormalizedEvent and returns it with sequenceNumber = SQLite rowid
- getEventsSince() returns events with sequence_number > N in ascending order
- All 11 TDD tests pass; full suite 19/19 (shared + daemon)

## Task Commits

Each task was committed atomically:

1. **Scaffold: @cockpit/daemon package** - `92bc7b0` (chore)
2. **RED: failing tests** - `7e7fd12` (test)
3. **GREEN: implementation** - `923bf58` (feat)

_Note: TDD tasks have multiple commits (scaffold → test → feat)_

## Files Created/Modified
- `packages/daemon/package.json` - @cockpit/daemon identity with better-sqlite3, ws, @cockpit/shared deps
- `packages/daemon/tsconfig.json` - Extends tsconfig.base.json, src/ rootDir
- `packages/daemon/vitest.config.ts` - Vitest node environment config
- `packages/daemon/src/db/database.ts` - openDatabase() with WAL, schema, checkpoint scheduling
- `packages/daemon/src/db/queries.ts` - persistEvent() and getEventsSince() prepared statement wrappers
- `packages/daemon/src/__tests__/database.test.ts` - 11 behavioral tests (openDatabase, persistEvent, getEventsSince)
- `pnpm-workspace.yaml` - Added onlyBuiltDependencies for better-sqlite3 and esbuild
- `pnpm-lock.yaml` - Updated lockfile with all new dependencies
- `.npmrc` - enable-pre-post-scripts (supplementary to onlyBuiltDependencies)
- `.gitignore` - node_modules, dist, .tsbuildinfo, .DS_Store
- `package.json` - Fixed root test script (vitest run → vitest)

## Decisions Made
- WAL mode is only asserted (throw if not 'wal') for file-based databases. SQLite in-memory databases always use 'memory' journal mode — this is a fundamental SQLite constraint, not a configuration error.
- WAL test uses a temp file (os.tmpdir() + fs.mkdtempSync) so the WAL assertion can be exercised in the test suite.
- INTEGER PRIMARY KEY without AUTOINCREMENT — rowid acts as sequenceNumber. For an append-only event log, rowid recycling after deletion is not a concern.
- pnpm onlyBuiltDependencies in pnpm-workspace.yaml is the correct way to allow native addon builds in pnpm v10; approve-builds is interactive-only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed WAL mode assertion for :memory: databases**
- **Found during:** GREEN phase (running tests after implementation)
- **Issue:** `openDatabase(':memory:')` calls `pragma('journal_mode = WAL')` which returns `'memory'` (not `'wal'`) because SQLite in-memory databases cannot use WAL mode. The implementation threw an error on every test.
- **Fix:** Added `dbPath !== ':memory:'` guard before the WAL assertion. Updated the WAL test to use a real temp file via `os.tmpdir()` so the assertion is still exercised.
- **Files modified:** packages/daemon/src/db/database.ts, packages/daemon/src/__tests__/database.test.ts
- **Verification:** All 11 tests pass; WAL test confirms file DB returns 'wal'
- **Committed in:** 923bf58 (GREEN task commit)

**2. [Rule 1 - Bug] Fixed root package.json test script (vitest run → vitest)**
- **Found during:** Full suite verification (`pnpm test run`)
- **Issue:** Root package.json had `"test": "vitest run"`. Running `pnpm test run` produces `vitest run run`, which finds no test files.
- **Fix:** Changed script to `"test": "vitest"` — same fix applied to packages/shared in Plan 01, now applied to root package.
- **Files modified:** package.json (root)
- **Verification:** `pnpm test run` exits 0, 19 tests pass
- **Committed in:** 923bf58 (GREEN task commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes are correctness requirements. No scope creep. WAL mode still confirmed working via temp file test.

## Issues Encountered
- pnpm `approve-builds` is interactive-only and cannot be used in non-TTY execution. The correct alternative is adding `onlyBuiltDependencies` to `pnpm-workspace.yaml`, which was applied as a deviation fix.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- packages/daemon with openDatabase, persistEvent, getEventsSince ready for use
- Plan 03 (IPC server) can import from `packages/daemon/src/db/database.js` and `packages/daemon/src/db/queries.js`
- Full test suite (19 tests) is green — no blockers

---
*Phase: 01-daemon-core*
*Completed: 2026-04-05*

## Self-Check: PASSED

- FOUND: packages/daemon/src/db/database.ts
- FOUND: packages/daemon/src/db/queries.ts
- FOUND: packages/daemon/src/__tests__/database.test.ts
- FOUND: .planning/phases/01-daemon-core/01-02-SUMMARY.md
- FOUND commit 92bc7b0 (scaffold)
- FOUND commit 7e7fd12 (RED tests)
- FOUND commit 923bf58 (GREEN implementation)
