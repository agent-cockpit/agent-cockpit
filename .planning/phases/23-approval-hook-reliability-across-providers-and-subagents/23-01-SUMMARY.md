---
phase: 23-approval-hook-reliability-across-providers-and-subagents
plan: "01"
subsystem: testing
tags: [approvals, vitest, idempotency, replay, codex, claude, websocket]

# Dependency graph
requires:
  - phase: 22-unified-session-chat-with-daemon-vs-external-capability-split
    provides: session_chat dispatch and capability split that this builds on top of

provides:
  - Approval reliability matrix (PermissionRequest, double-resolve, timeout+manual race, Codex cleanup, subagent integrity)
  - approvalsSlice reference-identity fix for Zustand selector memoization
  - Replay convergence tests for out-of-order approval_resolved events

affects:
  - phase-24-agent-avatar-chat-popup
  - phase-25-session-termination-controls

# Tech tracking
tech-stack:
  added: []
  patterns:
    - pendingSet claim-delete pattern ensures exactly-once resolution in ApprovalQueue
    - Return same state reference (not new wrapper object) on no-op paths in Zustand reducers

key-files:
  created: []
  modified:
    - packages/daemon/src/__tests__/hook-server.test.ts
    - packages/daemon/src/__tests__/approval-queue.test.ts
    - packages/daemon/src/__tests__/hookParser.test.ts
    - packages/daemon/src/adapters/codex/__tests__/codexAdapter.test.ts
    - packages/ui/src/__tests__/approvalsSlice.test.ts
    - packages/ui/src/store/approvalsSlice.ts

key-decisions:
  - "applyEventToApprovals must return same state reference (not new wrapper) on unrelated events — preserves Zustand selector memoization and reference equality in tests"
  - "Approval reliability is already enforced by pendingSet claim-delete in approvalQueue.ts — tests codify the guarantee rather than fix a gap"
  - "Out-of-order replay (resolved before request) leaves pending card until a second resolved replay clears it — this is the documented convergence guarantee"

patterns-established:
  - "Reducer no-op path: return state not { ...state } — avoids spurious re-renders"
  - "Reliability matrix tests: cover PermissionRequest, PreToolUse, timeout+manual race, double-decide, Codex process-exit cleanup, subagent event integrity"

requirements-completed:
  - APPR-HOOK-01
  - APPR-HOOK-02
  - APPR-HOOK-03

# Metrics
duration: 4min
completed: "2026-04-14"
---

# Phase 23 Plan 01: Approval Hook Reliability Summary

**Approval reliability matrix across Claude (PreToolUse + PermissionRequest), Codex (requestApproval), timeout/manual race, and UI replay convergence — with one bug fix in approvalsSlice state identity**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-14T09:58:28Z
- **Completed:** 2026-04-14T10:01:54Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Built explicit test matrix covering all critical approval paths: PermissionRequest envelope, double-resolveApproval no-op, timeout+manual race idempotency, Codex double-resolve race, subagent event integrity under concurrent approvals, UI replay convergence
- Fixed `approvalsSlice.ts` bug: `applyEventToApprovals` was creating a new object on unrelated events instead of returning the same state reference — breaks Zustand selector memoization
- Confirmed all existing approval semantics are already correct (pendingSet claim-delete, Codex cleanup on process exit, resolveApproval no-op on unknown IDs)

## Task Commits

1. **Task 1: Build approval reliability matrix (RED tests)** - `c87fb02` (test)
2. **Task 2: Harden provider and queue resolution semantics (GREEN)** - `088958c` (feat)
3. **Task 3: Fix UI replay convergence for approval state** - `f58c4df` (fix)

## Files Created/Modified

- `packages/daemon/src/__tests__/hook-server.test.ts` — Added Test 16 (PermissionRequest envelope), Test 17 (double-resolve no-op)
- `packages/daemon/src/__tests__/approval-queue.test.ts` — Added Tests 12-14: decide idempotency, timeout-then-decide race, decide-then-timeout race
- `packages/daemon/src/__tests__/hookParser.test.ts` — Added subagent integrity test under concurrent approval flows
- `packages/daemon/src/adapters/codex/__tests__/codexAdapter.test.ts` — Added Codex double-resolve race test
- `packages/ui/src/__tests__/approvalsSlice.test.ts` — Added replay convergence tests: out-of-order resolved, late-resolved dedup
- `packages/ui/src/store/approvalsSlice.ts` — Fixed no-op path to return `state` not `{ pendingApprovalsBySession: state.pendingApprovalsBySession }`

## Decisions Made

- Return `state` directly on no-op path in `applyEventToApprovals` — not a new wrapper object — preserves Zustand selector memoization
- Out-of-order replay (resolved arrives before request) is documented: pending card appears if request arrives after, then clears on second resolved replay — this is the convergence guarantee
- Existing approval idempotency relies on `pendingSet` claim-delete in `approvalQueue.ts` — no structural changes needed, only test coverage

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed approvalsSlice returning new object on unrelated events**
- **Found during:** Task 3 (UI replay convergence)
- **Issue:** `applyEventToApprovals` returned `{ pendingApprovalsBySession: state.pendingApprovalsBySession }` (new object) instead of `state` for unrelated event types, breaking reference equality used by Zustand selectors and test assertions
- **Fix:** Changed the no-op return to `return state`
- **Files modified:** `packages/ui/src/store/approvalsSlice.ts`
- **Verification:** All 9 approvalsSlice tests pass including the reference-identity assertion
- **Committed in:** `f58c4df`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential correctness fix. No scope creep.

## Issues Encountered

None — approval reliability semantics were already correct in the daemon. Test matrix codified the guarantees and revealed the UI reference-identity bug.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Approval reliability is fully covered by tests; all paths resolve exactly once
- UI state is stable under reconnect/replay including late and duplicate resolved events
- Ready for Phase 24 (Agent Avatar Chat Popup) and Phase 25 (Session Termination Controls)

---
*Phase: 23-approval-hook-reliability-across-providers-and-subagents*
*Completed: 2026-04-14*
