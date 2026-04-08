---
phase: 10-approval-inbox-ui
plan: "01"
subsystem: ui-store
tags: [approvals, zustand, websocket, tdd]
dependency_graph:
  requires: []
  provides: [approvalsSlice, sendWsMessage, AppStore.pendingApprovalsBySession]
  affects: [packages/ui/src/store/index.ts, packages/ui/src/hooks/useSessionEvents.ts]
tech_stack:
  added: []
  patterns: [pure-reducer-slice, module-level-singleton-ws, discriminated-union-narrowing]
key_files:
  created:
    - packages/ui/src/store/approvalsSlice.ts
    - packages/ui/src/__tests__/approvalsSlice.test.ts
  modified:
    - packages/ui/src/store/index.ts
    - packages/ui/src/hooks/useSessionEvents.ts
decisions:
  - "approvalsSlice uses Pick<ApprovalsSlice> instead of Pick<AppStore> to avoid circular import at type level — AppStore extends ApprovalsSlice so callers passing AppStore state are type-compatible"
  - "NormalizedEvent discriminated union enables direct field access (event.approvalId) after type narrowing — no cast needed"
  - "EMPTY_APPROVALS is module-level to match EMPTY_EVENTS pattern and prevent infinite re-renders from selector equality failures"
metrics:
  duration: 2min
  completed: "2026-04-08"
  tasks_completed: 2
  files_modified: 4
---

# Phase 10 Plan 01: Approval Data Layer Summary

**One-liner:** Zustand approvalsSlice with add/dedup/remove reducer, sendWsMessage WS export, and AppStore union extension — full data layer for Plan 02's Approval Inbox UI.

## What Was Built

- `approvalsSlice.ts`: Pure reducer `applyEventToApprovals` that accumulates `approval_request` events into `pendingApprovalsBySession[sessionId]`, deduplicates by `approvalId` (catch-up replay safe), and removes entries on `approval_resolved`. Exports `PendingApproval` type, `ApprovalsSlice` interface, and `EMPTY_APPROVALS` stable reference.
- `approvalsSlice.test.ts`: 7 unit tests covering all reducer branches — add, append, dedup, remove, unknown session no-op, unrelated event no-op, EMPTY_APPROVALS identity.
- `useSessionEvents.ts`: `sendWsMessage(msg: object)` exported alongside existing functions — sends JSON over `ws` if `readyState === WebSocket.OPEN`, silently no-ops otherwise.
- `store/index.ts`: `AppStore` union extended with `ApprovalsSlice`, `pendingApprovalsBySession: {}` added to initial state, `applyEventToApprovals` called in `applyEvent`.

## Verification Results

- `pnpm --filter @cockpit/ui test --run`: 175 tests across 20 files — all pass, no regressions
- `pnpm --filter @cockpit/ui exec tsc --noEmit`: No TypeScript errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Avoided circular import by using `Pick<ApprovalsSlice>` instead of `Pick<AppStore>`**
- **Found during:** Task 1 — implementing `approvalsSlice.ts`
- **Issue:** Plan template showed `import type { AppStore } from './index.js'` in `approvalsSlice.ts`, but `index.ts` would import from `approvalsSlice.ts`, creating a circular import. The `eventsSlice.ts` has the same pattern and TypeScript resolves it at compile time, but the slice function signature doesn't actually need the full `AppStore` type — it only needs its own slice fields.
- **Fix:** Used `Pick<ApprovalsSlice, 'pendingApprovalsBySession'>` in the function signatures. Since `AppStore extends ApprovalsSlice`, callers passing an `AppStore` state are structurally compatible.
- **Files modified:** `packages/ui/src/store/approvalsSlice.ts`
- **Commit:** b5b88d5

## Self-Check: PASSED

- packages/ui/src/store/approvalsSlice.ts — FOUND
- packages/ui/src/__tests__/approvalsSlice.test.ts — FOUND
- Commit b5b88d5 (Task 1) — FOUND
- Commit 2eb16ca (Task 2) — FOUND
