---
phase: 01-daemon-core
plan: 01
subsystem: infra
tags: [pnpm, monorepo, typescript, zod, vitest, nodejs]

# Dependency graph
requires: []
provides:
  - pnpm workspace monorepo with packages/* scope
  - "@cockpit/shared package with NormalizedEvent Zod discriminated union schema"
  - TypeScript inferred NormalizedEvent type for use across all packages
  - Root vitest config with projects mode for multi-package test runs
affects:
  - 01-daemon-core (02-sqlite-store, 03-ipc-server — both import @cockpit/shared)
  - All future packages that need event types

# Tech tracking
tech-stack:
  added: [pnpm@10.33.0, typescript@5.9.3, vitest@3.2.4, zod@4.x, tsx@4.21.0]
  patterns:
    - NodeNext module resolution with .js extensions in TypeScript source imports
    - Zod discriminated union as single source of truth for types (no duplicate interfaces)
    - TDD red-green cycle: failing test commit before implementation commit
    - Package exports pointing to src/index.ts for no-build-step workspace usage

key-files:
  created:
    - pnpm-workspace.yaml
    - package.json
    - tsconfig.base.json
    - vitest.config.ts
    - packages/shared/package.json
    - packages/shared/tsconfig.json
    - packages/shared/vitest.config.ts
    - packages/shared/src/events.ts
    - packages/shared/src/index.ts
    - packages/shared/src/__tests__/events.test.ts
  modified: []

key-decisions:
  - "Package exports point to ./src/index.ts (not ./dist) — no build step required in workspace development"
  - "NodeNext moduleResolution used throughout — requires .js extensions in TypeScript source imports"
  - "Zod v4 installed for @cockpit/shared — discriminated union on 'type' field"
  - "vitest.config.ts at root uses 'projects' field (not deprecated vitest.workspace.ts) per Vitest 3.2+ convention"
  - "sequenceNumber is optional on NormalizedEvent — adapters omit it, SQLite assigns on insert"

patterns-established:
  - "Event schema pattern: BaseEvent extends into specific event types via .extend(), all united in NormalizedEventSchema discriminated union"
  - "Workspace package import pattern: packages use workspace:* and import @cockpit/shared without a build step"

requirements-completed: [DAEMON-01]

# Metrics
duration: 2min
completed: 2026-04-05
---

# Phase 1 Plan 01: Monorepo Bootstrap and NormalizedEvent Schema Summary

**pnpm monorepo scaffold with @cockpit/shared exporting a Zod-validated NormalizedEvent discriminated union covering 11 event types**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-05T03:44:03Z
- **Completed:** 2026-04-05T03:45:59Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- pnpm workspaces configured with packages/* scope — root is tooling host only
- NormalizedEvent Zod schema defined as discriminated union on 'type' with 11 members: session_start, session_end, tool_call, file_change, approval_request, approval_resolved, subagent_spawn, subagent_complete, memory_read, memory_write, provider_parse_error
- TypeScript type inferred from Zod schema — zero duplicate interface declarations
- All 8 TDD tests pass: valid events parse, invalid events throw ZodError, sequenceNumber is optional
- @cockpit/shared importable by other workspace packages without a build step

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold monorepo root** - `fde8e78` (chore)
2. **Task 2: TDD RED — failing tests** - `b20ed7c` (test)
3. **Task 2: TDD GREEN — implement schema** - `2989492` (feat)

**Plan metadata:** (pending final docs commit)

_Note: TDD tasks have multiple commits (test → feat)_

## Files Created/Modified
- `pnpm-workspace.yaml` - Workspace definition with packages/* scope
- `package.json` - Root package (private) with test/build/typecheck scripts
- `tsconfig.base.json` - Shared TypeScript config (NodeNext, strict, ES2022)
- `vitest.config.ts` - Root test runner using projects mode
- `packages/shared/package.json` - @cockpit/shared identity, exports to src/index.ts
- `packages/shared/tsconfig.json` - Extends tsconfig.base.json, includes src/
- `packages/shared/vitest.config.ts` - Package-level test config with name 'shared'
- `packages/shared/src/events.ts` - NormalizedEventSchema + NormalizedEvent type + 11 event schemas
- `packages/shared/src/index.ts` - Public API re-exports for all event schemas and type
- `packages/shared/src/__tests__/events.test.ts` - 8 behavioral tests covering all plan specs

## Decisions Made
- Package exports point to `./src/index.ts` (source, not dist) so other workspace packages can import without a build step during development
- NodeNext module resolution requires `.js` extensions in TypeScript import paths even for `.ts` source files — established as monorepo-wide convention
- Zod v4 used — discriminated union API unchanged, all tests pass
- `vitest.config.ts` at root uses `projects` array (not `vitest.workspace.ts`, which is deprecated as of Vitest 3.2)
- `sequenceNumber` is intentionally optional on events — adapters don't generate it; SQLite rowid assigns it on insert

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed double `run` argument in vitest test script**
- **Found during:** Task 2 (TDD RED verification)
- **Issue:** package.json had `"test": "vitest run"` and `pnpm test run` appended a second `run`, resulting in `vitest run run` which found no test files
- **Fix:** Changed script from `"vitest run"` to `"vitest"` so `pnpm test run` produces the correct `vitest run`
- **Files modified:** packages/shared/package.json
- **Verification:** pnpm --filter @cockpit/shared test run exits 0 with 8 tests passing
- **Committed in:** b20ed7c (merged with RED test commit)

**2. [Rule 2 - Missing Critical] Exported BaseEvent schema**
- **Found during:** Task 2 (implementing index.ts)
- **Issue:** Plan's index.ts exports `BaseEvent` but events.ts declared it as unexported `const`
- **Fix:** Added `export` keyword to `BaseEvent` declaration
- **Files modified:** packages/shared/src/events.ts
- **Verification:** All 8 tests pass, BaseEvent is accessible to consumers needing the base schema
- **Committed in:** 2989492 (part of GREEN task commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing export)
**Impact on plan:** Both fixes align with plan intent. No scope creep.

## Issues Encountered
None beyond the two auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `@cockpit/shared` is ready for import by packages/daemon (Plan 02) and packages/ipc-server (Plan 03)
- NormalizedEvent schema covers all Phase 1 daemon event types plus placeholders for Phase 2+ (memory, subagent, approval events)
- pnpm workspace is configured — new packages under packages/* are auto-detected
- No blockers

---
*Phase: 01-daemon-core*
*Completed: 2026-04-05*
