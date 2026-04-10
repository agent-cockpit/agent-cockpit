---
phase: 14-office-map-view-full-navigation-paradigm-shift
plan: 03
subsystem: ui-layout
tags: [radix-dialog, radix-tabs, zustand, tdd]

# Dependency graph
requires:
  - phase: 14-02
    provides: [panel-sessionid-fallback, ApprovalInbox with store-selected sessionId]
provides:
  - InstancePopupHub component (Radix Dialog + Tabs popup wrapper)
  - MapSidebar component (minimal active session list)
  - Regression tests for approvals in popup context
affects: [14-04]

# Tech tracking
tech-stack:
  added: [@radix-ui/react-dialog, @radix-ui/react-tabs]
  patterns: [store-selected sessionId for popup context, Radix component mocking for RTL tests]

key-files:
  created: [packages/ui/src/components/office/InstancePopupHub.tsx, packages/ui/src/components/layout/MapSidebar.tsx]
  modified: [packages/ui/src/components/office/__tests__/InstancePopupHub.test.tsx]

key-decisions:
  - "Mock Radix Dialog.Close to trigger onOpenChange callback via module-level reference"
  - "Use vi.hoisted() for sendWsMessage mock to avoid initialization order issues"
  - "MapSidebar uses useActiveSessions selector instead of full useFilteredSessions pattern"

patterns-established:
  - "Popup context pattern: Components read sessionId from Zustand store (selectedSessionId), not URL params"
  - "Radix UI test mocking: Component mocks must trigger parent callbacks to simulate real behavior"
  - "Minimal sidebar: MapSidebar shows only active sessions, no filters or modals"

requirements-completed: [popup-hub, sidebar-minimal, sidebar-focus, approvals-regression]

# Metrics
duration: 8min
completed: 2026-04-10
---

# Phase 14: Plan 3 Summary

**InstancePopupHub with Radix Dialog + Tabs, MapSidebar minimal session list, and approval button regression tests for popup context**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-10T16:11:35Z
- **Completed:** 2026-04-10T16:19:33Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Built InstancePopupHub component with Radix Dialog and 5-tab interface (Approvals, Timeline, Diff, Memory, Artifacts)
- Created MapSidebar showing only active sessions with status indicators and camera focus callback
- Verified ApprovalInbox works correctly in popup context (store-selected sessionId instead of URL params)
- All 14 new tests passing (6 InstancePopupHub, 4 MapSidebar, 4 ApprovalInboxPopup regression)

## Task Commits

Each task was committed atomically:

1. **Task 1: Build InstancePopupHub with Radix Dialog + Tabs** - `d1a2ae8` (feat)
2. **Task 2: Build MapSidebar minimal active session list** - `bea90df` (feat)
3. **Task 3: Verify approve/deny/always-allow buttons work in popup context** - `70820c1` (test)

**Plan metadata:** TBD (docs: complete plan)

_Note: TDD tasks executed with RED → GREEN pattern_

## Files Created/Modified

- `packages/ui/src/components/office/InstancePopupHub.tsx` - Radix Dialog + Tabs popup hub wrapping all 5 panels, reads selectedSessionId from Zustand
- `packages/ui/src/components/office/__tests__/InstancePopupHub.test.tsx` - RTL tests for InstancePopupHub (6 tests, all passing)
- `packages/ui/src/components/layout/MapSidebar.tsx` - Minimal sidebar showing active sessions with status dots and onFocusSession callback
- `packages/ui/src/components/layout/__tests__/MapSidebar.test.tsx` - RTL tests for MapSidebar (4 tests, all passing)
- `packages/ui/src/components/office/__tests__/ApprovalInboxPopup.test.tsx` - Regression tests for approvals in popup context (4 tests, all passing)

## Decisions Made

**Mock Radix Dialog.Close to trigger onOpenChange callback via module-level reference**
- Radix Dialog.Close doesn't use simple onClick - it triggers the Root's onOpenChange internally
- Created module-level `mockDialogOnOpenChange` reference that Close mock calls with `false`
- This simulates the real Radix behavior where clicking Close triggers onOpenChange

**Use vi.hoisted() for sendWsMessage mock to avoid initialization order issues**
- sendWsMessage is imported by ApprovalInbox, so mock must be defined before import
- Used `vi.hoisted(() => ({ mockSendWsMessage: vi.fn() }))` to hoist mock definition
- Mocked both sendWsMessage and connectDaemon from useSessionEvents

**MapSidebar uses useActiveSessions selector instead of full useFilteredSessions pattern**
- MapSidebar is minimal - shows only active sessions, no filters or search
- Directly imports useActiveSessions from selectors for simplicity
- Each session row shows status dot and workspace basename

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Radix Dialog.Close mock not triggering onClose callback**
- **Problem:** Initial mock used simple onClick prop, but Radix Close triggers Root's onOpenChange
- **Resolution:** Created module-level `mockDialogOnOpenChange` reference that Close mock calls
- **Impact:** Test now correctly verifies onClose is called when close button clicked

**sendWsMessage mock initialization order issue**
- **Problem:** "Cannot access 'mockSendWsMessage' before initialization" error
- **Root cause:** ApprovalInbox imports sendWsMessage before mock is defined
- **Resolution:** Used vi.hoisted() to define mock before imports
- **Impact:** Tests now compile and run correctly

**PendingApproval mock structure incomplete**
- **Problem:** TypeError "Cannot read properties of undefined (reading 'split')" in formatActionType
- **Root cause:** Mock approval object missing required fields (actionType, riskLevel, proposedAction, etc.)
- **Resolution:** Added all required PendingApproval fields to mock object
- **Impact:** ApprovalInbox renders correctly in tests

**sendWsMessage import path mismatch**
- **Problem:** Initial test mocked from '../../../lib/ws-client.js', but ApprovalInbox imports from '../../../hooks/useSessionEvents.js'
- **Root cause:** Checked ApprovalInbox.tsx imports, found correct path
- **Resolution:** Updated mock to use correct import path
- **Impact:** sendWsMessage is now properly mocked and called

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- InstancePopupHub ready for integration in Plan 04 (root layout wiring)
- MapSidebar ready for integration in Plan 04 (camera focus callback wiring)
- ApprovalInbox regression test confirms popup context pattern works correctly
- All components use store-selected sessionId, ready for URL-less navigation paradigm

---
*Phase: 14-office-map-view-full-navigation-paradigm-shift*
*Plan: 03*
*Completed: 2026-04-10*
