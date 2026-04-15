---
phase: 23-approval-hook-reliability-across-providers-and-subagents
verified: 2026-04-14T10:05:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 23: Approval Hook Reliability Verification Report

**Phase Goal:** Fix approval flows that are currently failing by hardening hook/event handling so approvals and related events resolve reliably for Claude and Codex, including subagent scenarios.
**Verified:** 2026-04-14T10:05:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every approval_request can be resolved exactly once (approve/deny/always_allow/timeout) in both providers | VERIFIED | `pendingSet` claim-delete in `approvalQueue.ts` enforces single resolution; `resolveCodexApproval` deletes from `codexApprovalResolvers` on first call; Tests 12-14 (approval-queue) cover idempotency, timeout-then-decide, and decide-then-timeout races; all 17 approval-queue tests pass |
| 2 | Hook timeout and manual decision paths emit consistent `approval_resolved` events | VERIFIED | Both `decide()` and `handleTimeout()` in `approvalQueue.ts` emit `approval_resolved` via `eventBus.emit('event', resolvedEvent)`; decision field is set correctly (`approved`/`denied`/`always_allow`/`timeout`); Tests 7, 10, 12-14 confirm; 18/18 hook-server tests pass |
| 3 | Subagent-related approval and lifecycle events are persisted and replayed correctly | VERIFIED | `hookParser.test.ts` has dedicated `parseHookPayload subagent integrity under approval flows` describe block; SubagentStart/SubagentStop preserve type and sessionId integrity under concurrent approval flows; 10/10 hookParser tests pass |
| 4 | No provider-specific regression: Claude hook approvals and Codex app-server approvals both remain green | VERIFIED | Claude: hook-server tests cover PreToolUse, PermissionRequest (Test 16), double-resolve no-op (Test 17) — 18/18 pass; Codex: codexAdapter tests cover requestApproval, double-resolve race — 8/8 pass |
| 5 | Regression tests cover PreToolUse, PermissionRequest, and subagent flows end-to-end | VERIFIED | PreToolUse: hook-server Tests 12-15; PermissionRequest: hook-server Test 16; SubagentStart/Stop: hookParser subagent integrity describe block; Codex requestApproval: codexAdapter tests at lines 130, 171, 243, 322 |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/daemon/src/approvals/approvalQueue.ts` | Queue-level idempotent approval resolution | VERIFIED | Contains `pendingSet` claim-delete; emits `approval_resolved` on decide and timeout; 144 lines of substantive implementation |
| `packages/daemon/src/adapters/codex/codexAdapter.ts` | Codex approval cleanup and resolver safety | VERIFIED | Contains `pendingCodexApprovals` (7 usages); `resolveCodexApproval` deletes from module-level resolver map; process-exit cleanup clears all pending approvals |
| `packages/daemon/src/__tests__/approval-queue.test.ts` | Idempotency + race coverage | VERIFIED | Tests 12-14 cover: decide idempotency, timeout-then-decide, decide-then-timeout; 17 total tests pass |
| `packages/daemon/src/__tests__/hook-server.test.ts` | PermissionRequest + double-resolve coverage | VERIFIED | Tests 16-17 added; 18 total tests pass |
| `packages/daemon/src/__tests__/hookParser.test.ts` | Subagent integrity under approval flows | VERIFIED | Dedicated describe block; 10 tests pass |
| `packages/daemon/src/adapters/codex/__tests__/codexAdapter.test.ts` | Codex double-resolve race | VERIFIED | `approval double-resolve` test at line 322; 8 tests pass |
| `packages/ui/src/__tests__/approvalsSlice.test.ts` | Replay convergence tests | VERIFIED | Out-of-order resolved, late-resolved dedup tests present; 9 tests pass |
| `packages/ui/src/store/approvalsSlice.ts` | Stable state reference on no-op paths | VERIFIED | No-op path returns `state` (not `{ ...state }`); `approval_request` and `approval_resolved` both handled; wired into `store/index.ts` via `applyEventToApprovals` at line 91 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/daemon/src/ws/handlers.ts` | `packages/daemon/src/approvals/approvalQueue.ts` | `approval_decision` message type | WIRED | `approvalQueue.decide(approvalId, decision, db)` called at line 92 of handlers.ts when `m['type'] === 'approval_decision'` |
| `packages/ui/src/store/approvalsSlice.ts` | `packages/shared/src/events.ts` | `approval_request` + `approval_resolved` replay | WIRED | `applyEventToApprovals` handles both event types; function is called in `store/index.ts` line 91 on every incoming event; `ApprovalInbox.tsx` imports `EMPTY_APPROVALS` and `PendingApproval` types |
| `packages/daemon/src/approvals/approvalQueue.ts` | `packages/daemon/src/adapters/claude/hookServer.ts` | `resolveApproval` call after decide/timeout | WIRED | `resolveApproval(approvalId, hookDecision)` called in `decide()` line 106; `resolveApproval(approvalId, 'deny', reason)` called in `handleTimeout()` line 138 |
| `packages/daemon/src/approvals/approvalQueue.ts` | `packages/daemon/src/adapters/codex/codexAdapter.ts` | `resolveCodexApproval` call after decide/timeout | WIRED | `resolveCodexApproval(approvalId, decision)` called in `decide()` line 108; `resolveCodexApproval(approvalId, 'deny')` called in `handleTimeout()` line 140 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| APPR-HOOK-01 | 23-01-PLAN.md | Phase-local: exactly-once approval resolution across providers | SATISFIED | `pendingSet` claim-delete in `approvalQueue.ts`; idempotency tests 12-14 all pass |
| APPR-HOOK-02 | 23-01-PLAN.md | Phase-local: consistent `approval_resolved` events from timeout and manual paths | SATISFIED | Both `decide()` and `handleTimeout()` emit `approval_resolved`; hook-server Test 16 covers PermissionRequest envelope; Test 17 covers double-resolve no-op |
| APPR-HOOK-03 | 23-01-PLAN.md | Phase-local: subagent lifecycle event integrity under approval-heavy flows | SATISFIED | `hookParser.test.ts` subagent integrity describe block verifies SubagentStart/SubagentStop preserve type and sessionId after concurrent approvals |

**Note on requirement IDs:** APPR-HOOK-01, APPR-HOOK-02, APPR-HOOK-03 are phase-local identifiers defined in the ROADMAP for Phase 23. They do not appear in the global REQUIREMENTS.md traceability table (which covers v1 product requirements). This is consistent with the ROADMAP's use of phase-scoped technical requirement IDs for reliability/hardening phases. No orphaned requirements were found — all three IDs are accounted for by the plan and verified by tests.

### Anti-Patterns Found

None. All modified source files (`approvalQueue.ts`, `codexAdapter.ts`, `approvalsSlice.ts`, `ws/handlers.ts`) are free of TODO/FIXME/placeholder comments, empty handlers, and stub return values.

### Human Verification Required

None. All observable truths are verifiable programmatically via test suite execution. No visual, real-time, or external service behavior is part of this phase's scope.

### Gaps Summary

No gaps. All five success criteria from the ROADMAP are satisfied:

1. Exactly-once resolution is enforced by `pendingSet` claim-delete and confirmed by idempotency tests.
2. Both timeout and manual paths emit `approval_resolved` with correct `decision` field.
3. Subagent integrity is verified by dedicated test describe block in `hookParser.test.ts`.
4. No provider regressions: 18/18 hook-server tests and 8/8 codexAdapter tests pass.
5. Regression tests cover PreToolUse, PermissionRequest, and subagent flows.

The one code change beyond test coverage — the `approvalsSlice.ts` no-op path returning `state` instead of `{ ...state }` — is a correctness fix that prevents Zustand selector memoization breakage, confirmed by reference-identity test assertions in `approvalsSlice.test.ts`.

---

_Verified: 2026-04-14T10:05:00Z_
_Verifier: Claude (gsd-verifier)_
