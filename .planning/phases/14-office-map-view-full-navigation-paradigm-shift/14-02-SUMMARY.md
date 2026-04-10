---
phase: 14-office-map-view-full-navigation-paradigm-shift
plan: 02
subsystem: ui-panels
tags: [refactor, backward-compatibility, zustand, react-router]
dependency_graph:
  requires: [14-01]
  provides: [14-03]
  affects: [approval-inbox, timeline-panel, diff-panel, memory-panel]
tech_stack:
  added: []
  patterns: [param-fallback-chain, store-based-session-resolution]
key_files:
  created: []
  modified:
    - packages/ui/src/components/panels/ApprovalInbox.tsx
    - packages/ui/src/components/panels/TimelinePanel.tsx
    - packages/ui/src/components/panels/DiffPanel.tsx
    - packages/ui/src/components/panels/MemoryPanel.tsx
decisions: []
metrics:
  duration: "4 minutes"
  tasks_completed: 2
  files_modified: 4
  commits: 2
  tests_status: "235/249 passed (94%), 3 pre-existing failures"
---

# Phase 14 Plan 02: Session ID Fallback Refactor Summary

Successfully refactored 4 panel components to use `useParams` with Zustand `selectedSessionId` fallback. This enables panels to work in the popup hub context (Plan 03) where no `:sessionId` URL segment exists.

## What Was Built

### Core Refactor Pattern
Applied the fallback pattern to all 4 panels:
```typescript
const { sessionId: paramSessionId } = useParams<{ sessionId: string }>()
const storeSessionId = useStore((s) => s.selectedSessionId)
const sessionId = paramSessionId ?? storeSessionId ?? ''
```

### Modified Files
1. **ApprovalInbox.tsx** - Maintains `isConnected` guard and `sendWsMessage` call unchanged (approvals regression safe)
2. **TimelinePanel.tsx** - Uses `sessionId` for store reads and REST hydration
3. **DiffPanel.tsx** - Uses `sessionId` for events and session data
4. **MemoryPanel.tsx** - Preserves `historyMode` logic as specified in plan

### Key Design Decisions
- **Priority chain:** URL params take precedence over store value (backward compatibility)
- **Empty fallback:** Falls back to empty string when both are undefined (prevents null errors)
- **No UI changes:** Pure refactor, zero routing or visual changes
- **MemoryPanel preservation:** `historyMode` conditional rendering untouched (per plan specification)

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written.

### Pre-existing Test Failures (Documented in deferred-items.md)

The following 3 test failures were present BEFORE plan 14-02 changes and are out of scope:

1. **ApprovalInbox.test.tsx** - Risk badge test looks for text 'high' but component renders `<img alt="high risk">`
   - Root cause: Test should use `screen.getByRole('img', { name: 'high risk' })`
   - Impact: Pre-existing, not caused by refactor

2. **approvalsSlice.test.ts** - "returns state unchanged on unrelated event type" fails on reference equality
   - Root cause: Test uses `toBe` but reducer returns new reference
   - Impact: Pre-existing, unrelated to sessionId logic

3. **eventsSlice.test.ts** - "skips an event whose sequenceNumber is already present (dedup guard)" fails on reference equality
   - Root cause: Same as #2 - test expects reference equality
   - Impact: Pre-existing, unrelated to sessionId logic

All 3 failures are documented in `deferred-items.md` with recommended fixes. The refactor caused 0 new test failures.

## Verification Results

### Success Criteria Met
- [x] All 4 panel files use `paramSessionId ?? storeSessionId ?? ''` pattern
- [x] Full `pnpm test --run` suite: 235/249 passed (94%)
- [x] ApprovalInbox `isConnected` guard and `sendWsMessage` unchanged
- [x] MemoryPanel `historyMode` logic unchanged

### Test Results
- **Total tests:** 249
- **Passed:** 235 (94%)
- **Failed:** 3 (all pre-existing)
- **Todo:** 11

### Pattern Validation
Verified that URL params take priority over store value:
- When `:sessionId` exists in URL → `paramSessionId` used (existing routed behavior)
- When `:sessionId` is undefined → falls back to `store.selectedSessionId` (popup hub behavior)
- Both produce identical panel rendering and behavior

## Implementation Details

### Task 1: ApprovalInbox Refactor
- Added 2 lines after `useParams`: `storeSessionId` selector and fallback logic
- Preserved `isConnected` guard at line 117 (`disabled={!isConnected}` on buttons)
- Preserved `sendWsMessage` call at line 112 in `handleDecision`
- Commit: `f587bf2`

### Task 2: TimelinePanel, DiffPanel, MemoryPanel Refactor
- Applied identical pattern to all 3 files
- Verified `useStore` was already imported (no duplicate imports)
- MemoryPanel `historyMode` logic preserved exactly as-is
- Commit: `e099943`

## Commits

- `f587bf2` - refactor(14-02): add useParams + store fallback to ApprovalInbox
- `e099943` - refactor(14-02): add useParams + store fallback to TimelinePanel, DiffPanel, MemoryPanel

## Next Steps

This refactor enables Plan 03 (popup hub implementation) where panels will be rendered without URL-based routing. The panels will now resolve session ID from the Zustand store's `selectedSessionId` field when URL params are absent.

## Technical Debt

None introduced by this plan. Pre-existing test failures are documented in `deferred-items.md` for future resolution.
