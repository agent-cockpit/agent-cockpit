---
phase: 02-claude-adapter-approval-foundation
plan: 02
subsystem: approvals
tags: [approvals, sqlite, websocket, tdd, typescript, approval-queue, round-trip]

# Dependency graph
requires:
  - phase: 02-01
    provides: "createHookServer() + resolveApproval() HTTP hold/resolve; openDatabase() with approvals + always_allow_rules tables"
  - phase: 01-03
    provides: "eventBus typed DaemonEventBus for internal event pipeline"
provides:
  - approvalStore.ts: insertApproval(), getApprovalById(), updateApprovalDecision(), insertAlwaysAllowRule() — synchronous SQLite CRUD
  - approvalQueue.ts: ApprovalQueue class + singleton; register/decide/handleTimeout; claim-then-act with pendingSet
  - ws/handlers.ts: approval_decision message routing to approvalQueue.decide()
affects:
  - Phase 03 (browser UI): approval round-trip complete — browser can send approval_decision and daemon resolves hold
  - Phase daemon index.ts: can now wire createHookServer onDecisionNeeded to approvalQueue.register

# Tech tracking
tech-stack:
  added: []
  patterns:
    - pendingSet (module-level Set<string>) for atomic claim-then-act: prevents double-resolution if timeout fires after explicit decide
    - pendingEvents (module-level Map) stores NormalizedEvent per approvalId — needed for always_allow rule construction
    - insertApproval called SYNCHRONOUSLY before eventBus.emit in register() — SQLite write happens before broadcast
    - always_allow decision derives toolName from actionType and pattern from proposedAction

key-files:
  created:
    - packages/daemon/src/approvals/approvalStore.ts
    - packages/daemon/src/approvals/approvalQueue.ts
    - packages/daemon/src/__tests__/approval-queue.test.ts
  modified:
    - packages/daemon/src/ws/handlers.ts

key-decisions:
  - "pendingSet claim-then-act: delete(approvalId) before any DB write or resolveApproval call — prevents double-resolution under concurrent timeout + decide"
  - "pendingEvents Map stores full NormalizedEvent per approvalId — required so always_allow decision can reconstruct sessionId/toolName/pattern without an extra DB read"
  - "approvalStore functions are thin synchronous wrappers — no business logic, just prepared statements; all orchestration lives in ApprovalQueue"

# Metrics
duration: 2min
completed: 2026-04-05
---

# Phase 02 Plan 02: Approval Queue + Round-Trip Summary

**In-memory + SQLite approval bridge: ApprovalQueue register/decide/handleTimeout wired to approvalStore CRUD and ws/handlers decision routing — completes the full Claude Code approval round-trip**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-05T04:44:43Z
- **Completed:** 2026-04-05T04:46:47Z
- **Tasks:** 2 (RED + GREEN, TDD)
- **Files modified:** 4

## Accomplishments

- `approvalStore.ts`: Four synchronous SQLite operations — `insertApproval()` (status='pending'), `getApprovalById()` (maps snake_case to camelCase ApprovalRow), `updateApprovalDecision()` (updates status + decided_at + reason), `insertAlwaysAllowRule()` (inserts into always_allow_rules table)
- `approvalQueue.ts`: `ApprovalQueue` class with module-level `pendingSet` (claim-then-act) and `pendingEvents` Map; `register()` inserts SQLite row BEFORE emitting on eventBus; `decide()` and `handleTimeout()` update DB, emit approval_resolved event, call resolveApproval; singleton export `approvalQueue`
- `ws/handlers.ts`: replaced no-op `ws.on('message')` with approval_decision router — parses JSON, guards type/approvalId/decision, dispatches to `approvalQueue.decide()`; malformed/unknown messages silently dropped
- All 55 tests pass: 14 new approval-queue tests + 41 prior tests unchanged

## Task Commits

Each task was committed atomically:

1. **RED: failing approval queue tests** - `1bb9d01` (test)
2. **GREEN: approval queue implementation** - `d549945` (feat)

## Files Created/Modified

- `packages/daemon/src/approvals/approvalStore.ts` — SQLite CRUD operations for approvals + always_allow_rules tables
- `packages/daemon/src/approvals/approvalQueue.ts` — ApprovalQueue class + singleton; full decision orchestration
- `packages/daemon/src/__tests__/approval-queue.test.ts` — 14 TDD tests covering all store operations, queue methods, and ws handler routing
- `packages/daemon/src/ws/handlers.ts` — extended with approval_decision message handler

## Decisions Made

- pendingSet claim-then-act prevents double-resolution: delete from Set before any I/O ensures no concurrent timeout + decide collision
- pendingEvents Map stores full NormalizedEvent to avoid an extra DB read when constructing always_allow rules (which need sessionId, toolName, pattern from the original approval_request event)
- approvalStore is a pure data layer — no business logic, all orchestration in ApprovalQueue — keeps concerns separated and store functions independently testable

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed infinite recursion in Test 6 mock**
- **Found during:** GREEN phase (Test 6: "register calls insertApproval before emitting event on eventBus")
- **Issue:** `vi.spyOn(storeMod, 'insertApproval').mockImplementation((...args) => { storeMod.insertApproval(...args) })` causes infinite recursion — `storeMod.insertApproval` at call time is already the spy, so the mock calls itself indefinitely
- **Fix:** Captured the original function before spy installation: `const originalInsert = storeMod.insertApproval; vi.spyOn(...).mockImplementation(() => { originalInsert(...) })`
- **Files modified:** `packages/daemon/src/__tests__/approval-queue.test.ts`
- **Verification:** Test 6 passes, full suite 55/55 green
- **Committed in:** `d549945` (GREEN task commit)

---

**Total deviations:** 1 auto-fixed (1 test bug)
**Impact on plan:** Test code fix only — production implementation was correct as written.

## Issues Encountered

None beyond the Test 6 mock recursion fix documented above.

## User Setup Required

None.

## Next Phase Readiness

- Approval round-trip is complete: `createHookServer` (hold) → browser `approval_decision` WebSocket message → `approvalQueue.decide()` → SQLite update → `resolveApproval()` (close hold)
- daemon `index.ts` can now wire `createHookServer(..., onDecisionNeeded: (id, event) => approvalQueue.register(id, event, db))` to activate full Claude Code approval pipeline
- All 55 tests green — Phase 02 complete, ready for Phase 03 (browser UI shell)

---

*Phase: 02-claude-adapter-approval-foundation*
*Completed: 2026-04-05*
