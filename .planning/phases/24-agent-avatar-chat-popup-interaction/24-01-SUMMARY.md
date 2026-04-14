---
phase: 24-agent-avatar-chat-popup-interaction
plan: "01"
subsystem: ui
tags: [office-mode, popup, chat, zustand, tabs, vitest]

# Dependency graph
requires:
  - phase: 23-approval-hook-reliability-across-providers-and-subagents
    provides: stable approval/session event handling that popup session routing now builds on

provides:
  - One-shot popup tab preference state (`popupPreferredTab`) to steer popup opening context
  - Avatar-click flow that always selects the clicked session, prefers Chat tab, and opens popup
  - Regression coverage proving non-avatar entry points still default to Approvals

affects:
  - phase-25-session-termination-controls

# Tech tracking
tech-stack:
  added: []
  patterns:
    - one-shot UI intent flags in Zustand (set preference, consume once, reset to null)
    - popup tab defaults remain explicit for non-avatar entry points

key-files:
  created: []
  modified:
    - packages/ui/src/store/index.ts
    - packages/ui/src/components/office/InstancePopupHub.tsx
    - packages/ui/src/pages/OfficePage.tsx
    - packages/ui/src/components/office/__tests__/InstancePopupHub.test.tsx
    - packages/ui/src/pages/__tests__/OfficePage.test.tsx
    - packages/ui/src/__tests__/OfficePage.test.tsx
    - packages/ui/src/__tests__/SessionListPanel.test.tsx

key-decisions:
  - "Store popup open intent as a dedicated `popupPreferredTab` value instead of reusing `activePanel`, to avoid cross-flow coupling with route-based panels"
  - "Consume `popupPreferredTab` inside `InstancePopupHub` on open and immediately clear it to keep avatar behavior one-shot"
  - "Keep non-avatar behavior deterministic by forcing Approvals as the default when no popup preference is present"

patterns-established:
  - "Avatar click contract: select session -> set popup chat preference -> open popup"
  - "Regression pattern: assert popup default tab behavior for both preferred and non-preferred openings"

requirements-completed:
  - POPUP-CHAT-01
  - POPUP-CHAT-02

# Metrics
duration: 7min
completed: "2026-04-14"
---

# Phase 24 Plan 01: Agent Avatar Chat Popup Interaction Summary

**Avatar clicks now open the exact session popup directly to Chat while non-avatar popup openings still default to Approvals.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-14T18:36:00-03:00
- **Completed:** 2026-04-14T18:43:03-03:00
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added popup preferred-tab plumbing in store and `InstancePopupHub` with one-shot consumption semantics.
- Wired Office avatar hit-test click flow to always set Chat preference before opening popup for the clicked session.
- Added regression tests to protect popup defaults and ensure session list interactions do not force chat-first behavior.

## Task Commits

1. **Task 1: Add popup preferred-tab plumbing for chat-first avatar opening** - `ffcc015` (feat)
2. **Task 2: Wire avatar click path to open chat for selected session** - `db88f20` (feat)
3. **Task 3: Regression pass for popup/session flows** - `86d762e` (test)

## Files Created/Modified

- `packages/ui/src/store/index.ts` - Added `PopupTabId`, `popupPreferredTab`, and setter in ui slice.
- `packages/ui/src/components/office/InstancePopupHub.tsx` - Made tab selection controlled and one-shot preference-aware.
- `packages/ui/src/pages/OfficePage.tsx` - On sprite click, now sets popup preferred tab to `chat` before opening popup.
- `packages/ui/src/components/office/__tests__/InstancePopupHub.test.tsx` - Added tests for chat preference consumption and non-avatar default tab behavior.
- `packages/ui/src/pages/__tests__/OfficePage.test.tsx` - Added assertions that avatar click sets chat preference and opens popup.
- `packages/ui/src/__tests__/OfficePage.test.tsx` - Updated store mock and click assertions for chat-first popup behavior.
- `packages/ui/src/__tests__/SessionListPanel.test.tsx` - Added regression test ensuring SessionList entry does not set popup chat preference.

## Decisions Made

- Introduced a dedicated popup-tab intent field (`popupPreferredTab`) instead of mutating route-level panel state.
- Kept default popup tab explicit (`approvals`) whenever no avatar-derived intent is present.
- Treated chat-first avatar behavior as one-shot state so subsequent non-avatar opens remain unchanged.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

None in implementation. (OfficePage tests still emit existing map fetch warnings in jsdom, but assertions pass.)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Avatar-to-chat popup behavior is deterministic and covered by focused tests.
- Non-avatar entry behavior remains stable and explicitly tested.
- Ready for Phase 24 verification and transition to Phase 25.

---
*Phase: 24-agent-avatar-chat-popup-interaction*
*Completed: 2026-04-14*
