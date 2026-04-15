---
phase: 10-approval-inbox-ui
plan: "02"
subsystem: ui-component
tags: [approvals, react, zustand, tdd, websocket, rtl]
dependency_graph:
  requires: [approvalsSlice, sendWsMessage, AppStore.pendingApprovalsBySession]
  provides: [ApprovalInbox]
  affects: [packages/ui/src/components/panels/ApprovalInbox.tsx]
tech_stack:
  added: []
  patterns: [tdd-red-green, optimistic-ui, zustand-selector, discriminated-union-narrowing]
key_files:
  created:
    - packages/ui/src/__tests__/ApprovalInbox.test.tsx
  modified:
    - packages/ui/src/components/panels/ApprovalInbox.tsx
decisions:
  - "vi.mock + top-level await import pattern used for sendWsMessage — allows mock to be cleared per-test while preserving module graph for RTL"
  - "Buttons use aria-label (not text content alone) for RTL role+name queries — ensures accessible names are unambiguous even with icon-only future variants"
metrics:
  duration: 2min
  completed: "2026-04-08"
  tasks_completed: 2
  files_modified: 2
---

# Phase 10 Plan 02: ApprovalInbox UI Summary

**One-liner:** Full ApprovalInbox implementation replacing 7-line stub — reads Zustand store, renders approval cards with all detail fields, sends approval_decision WebSocket messages, and removes acted-on cards optimistically; 12 RTL tests cover all APPR requirements.

## What Was Built

- `ApprovalInbox.tsx`: Full component replacing the 7-line stub. Reads `pendingApprovalsBySession[sessionId]` via Zustand selector and `wsStatus` to gate buttons. Local `decidedIds: Set<string>` state provides optimistic removal — acted-on approvals filter out of `visibleApprovals` immediately without waiting for a store update. Shows a "Reconnecting..." badge in the header when `wsStatus !== 'connected'`.

- `ApprovalCard` (inner component in same file): Renders all APPR-02/APPR-04 detail fields — `actionType` (formatted via underscore-split + title-case), `riskLevel` (color-coded badge: critical=red, high=orange, medium=yellow, low=green), `proposedAction`, `affectedPaths` list, `whyRisky`. Three decision buttons (Approve/Deny/Always Allow) are disabled with `opacity-50 cursor-not-allowed` when `wsStatus !== 'connected'`.

- `ApprovalInbox.test.tsx`: 12 RTL tests written TDD-first (RED confirmed, then GREEN). Mock via `vi.mock('../hooks/useSessionEvents.js')` + top-level `await import` for per-test `mockClear()`. Store seeded via `useStore.setState()` — no fetch mocks needed. Wrapped in `MemoryRouter + Route` to provide `useParams`.

## Verification Results

- `pnpm --filter @cockpit/ui test --run ApprovalInbox`: 12/12 tests pass
- `pnpm --filter @cockpit/ui test --run`: 187 tests across 21 files — all pass, 0 regressions

## Deviations from Plan

None — plan executed exactly as written. TDD RED → GREEN followed: tests written first and confirmed failing (12 failures), then implementation written to pass all 12.

## Self-Check: PASSED

- packages/ui/src/__tests__/ApprovalInbox.test.tsx — FOUND
- packages/ui/src/components/panels/ApprovalInbox.tsx — FOUND (no longer stub)
- Commit 72c310b (Task 1) — FOUND
- Full suite 187/187 (Task 2 validation) — PASSED
