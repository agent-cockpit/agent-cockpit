---
phase: 03-browser-ui-shell-session-management
plan: "03"
subsystem: ui
tags: [react, zustand, react-router, vite, tailwind, vitest, testing-library]

requires:
  - phase: 03-01
    provides: OpsLayout placeholder, SessionDetailPanel placeholder, router skeleton, Zustand store (uiSlice + sessionsSlice + wsSlice)
  - phase: 03-02
    provides: SessionFilters, LaunchSessionModal, useFilteredSessions selector, connectDaemon hook

provides:
  - SessionCard component with provider badge, status dot, pendingApprovals badge, selected highlight
  - SessionListPanel with SessionFilters + Launch button + LaunchSessionModal + SessionCard list
  - Full OpsLayout two-column shell (w-72 fixed sidebar + Outlet main area)
  - SessionDetailPanel with provider header, 5-tab NavLink strip, Outlet for panel child routes
  - Router with index route for session/:sessionId defaulting to ApprovalInbox
  - useFilteredSessions memoized via useRef to prevent React 18 useSyncExternalStore infinite loop
  - 40 passing tests across 7 test files covering layout shell, session list, launch modal, uiSlice

affects:
  - 04-codex-adapter
  - 05-timeline-panel
  - 06-approval-ui
  - 07-memory-panel

tech-stack:
  added: []
  patterns:
    - SessionListPanel unmocked in SessionListPanel.test.tsx with useNavigate mocked at module level — avoids Router context while testing component behavior
    - OpsLayout.test.tsx mocks SessionListPanel to test shell structure only — separation of concern in component tests
    - useRef memoization in useFilteredSessions — caches stable array reference across renders to satisfy React 18 useSyncExternalStore snapshot stability requirement

key-files:
  created:
    - packages/ui/src/components/sessions/SessionCard.tsx
    - packages/ui/src/components/layout/SessionListPanel.tsx
    - packages/ui/src/__tests__/OpsLayout.test.tsx
    - packages/ui/src/__tests__/SessionListPanel.test.tsx
    - packages/ui/src/__tests__/uiSlice.test.ts
  modified:
    - packages/ui/src/components/layout/OpsLayout.tsx
    - packages/ui/src/components/layout/SessionDetailPanel.tsx
    - packages/ui/src/router.tsx
    - packages/ui/src/store/selectors.ts

key-decisions:
  - "useFilteredSessions uses useRef to cache the result array — React 18's useSyncExternalStore checks snapshot reference equality; shallowArrayEqual alone was insufficient because the strict-mode double-invoke exposed the unstable reference"
  - "OpsLayout tests mock SessionListPanel to isolate shell structure — avoids Zustand/React-18 infinite loop in integration renders; SessionListPanel behaviors are tested in their own file"
  - "SessionListPanel.test.tsx mocks react-router at module level (useNavigate returns stable mockNavigate) — no Router context required for component behavior tests"
  - "SessionDetailPanel syncs active panel to Zustand store on mount via window.location.pathname — store stays in sync with URL for OPS-03 per-session panel state preservation"

patterns-established:
  - "Component tests mock react-router (useNavigate) at module level and do not require Router context — consistent with selectors.test.ts approach of avoiding renderHook infinite loops"
  - "Two-level test split: OpsLayout tests verify shell structure (sidebar+main); SessionListPanel tests verify card/modal behaviors — each file focuses on one responsibility"

requirements-completed:
  - OPS-01
  - OPS-02
  - OPS-03
  - OPS-04
  - SESS-02

duration: 9min
completed: 2026-04-05
---

# Phase 3 Plan 03: Browser UI Shell and Session Management Summary

**Two-column Ops layout with live session list, per-session detail panel with 5-tab navigation, LaunchSessionModal wired to Launch button — full Phase 3 browser UI complete**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-05T06:05:29Z
- **Completed:** 2026-04-05T06:14:00Z
- **Tasks:** 2 of 2 automated tasks complete (checkpoint:human-verify pending)
- **Files modified:** 9

## Accomplishments

- SessionCard renders provider badge (claude=blue, codex=purple), project basename, status dot (green/gray/red), pendingApprovals badge
- SessionListPanel: SessionFilters at top, Launch Session button (opens LaunchSessionModal), scrollable SessionCard list with empty state, navigate to /session/:id/approvals on card click
- OpsLayout: w-72 fixed sidebar with "Agent Cockpit" heading and SessionListPanel, Outlet main area
- SessionDetailPanel: header with provider badge/title/status/timestamp, 5 NavLink tabs, Outlet for panel child routes, syncs activePanel to store on mount
- Router updated with index route on session/:sessionId (defaults to ApprovalInbox)
- Fixed useFilteredSessions to use useRef memoization — resolved React 18 useSyncExternalStore infinite loop
- 40 tests across 7 files all green; typecheck exits 0

## Task Commits

1. **Task 1: SessionCard, SessionListPanel, OpsLayout shell, tests** — `cb423ce` (feat)
2. **Task 2: SessionDetailPanel, router update** — `eb9308d` (feat)

## Files Created/Modified

- `packages/ui/src/components/sessions/SessionCard.tsx` — Provider badge, status dot, pendingApprovals, selected highlight
- `packages/ui/src/components/layout/SessionListPanel.tsx` — Filters + Launch button + LaunchSessionModal + card list
- `packages/ui/src/components/layout/OpsLayout.tsx` — Full two-column shell replacing placeholder
- `packages/ui/src/components/layout/SessionDetailPanel.tsx` — Header + 5-tab strip + Outlet replacing placeholder
- `packages/ui/src/router.tsx` — Added index route for session/:sessionId defaulting to ApprovalInbox
- `packages/ui/src/store/selectors.ts` — useRef memoization to fix React 18 snapshot stability
- `packages/ui/src/__tests__/uiSlice.test.ts` — selectSession, setActivePanel, OPS-03 no panel reset
- `packages/ui/src/__tests__/OpsLayout.test.tsx` — Shell structure tests with mocked SessionListPanel
- `packages/ui/src/__tests__/SessionListPanel.test.tsx` — Cards, empty state, navigate, launch modal

## Decisions Made

- **useRef memoization in useFilteredSessions:** React 18's `useSyncExternalStore` calls `getSnapshot` twice in strict mode to verify reference equality. `shallowArrayEqual` prevented re-renders but didn't fix the snapshot stability check. `useRef` caches the stable array reference across renders, satisfying React 18's requirement.
- **Two-file test split for OpsLayout/SessionListPanel:** Rendering the full component tree with a real Zustand selector + Router context triggered infinite loops due to the above issue. Separating OpsLayout tests (mocked SessionListPanel, no selector) from SessionListPanel tests (real component, mocked useNavigate, no Router) isolates each concern cleanly.
- **SessionDetailPanel URL sync:** `window.location.pathname` read on mount to sync store with current URL — no additional router hook needed for OPS-03.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed useFilteredSessions infinite re-render loop in React 18**
- **Found during:** Task 1 (OpsLayout rendering in test environment)
- **Issue:** React 18's useSyncExternalStore strict-mode double-invocation detected unstable array reference from useFilteredSessions, causing "Maximum update depth exceeded" errors in all component tests
- **Fix:** Rewrote useFilteredSessions to use useRef to cache the result — returns the same array reference when content is equal, satisfying React 18's snapshot stability requirement
- **Files modified:** packages/ui/src/store/selectors.ts
- **Verification:** All 40 tests pass with no infinite loop warnings
- **Committed in:** cb423ce (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added index route for session/:sessionId in router**
- **Found during:** Task 2 (router update)
- **Issue:** Plan specified lazy panel routes but omitted index route — navigating to /session/:id without a panel suffix would render nothing
- **Fix:** Added index route pointing to ApprovalInbox (same as /approvals) so session URLs are always valid
- **Files modified:** packages/ui/src/router.tsx
- **Verification:** Router renders ApprovalInbox for bare /session/:id path
- **Committed in:** eb9308d (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered

- React 18 strict-mode snapshot stability with Zustand `subscribeWithSelector` and custom equality functions — resolved by useRef memoization (see deviation above)
- Module-level `vi.unmock()` in a single test file undoes mocks for the entire file, making mock/unmock in the same file unreliable — resolved by splitting OpsLayout and SessionListPanel tests into separate files

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Phase 3 complete. The browser UI shell is navigable:
- Left sidebar: session list with filters, Launch button opens LaunchSessionModal
- Right main area: session detail with 5-tab panel navigation, each tab renders its empty-state component
- Store: sessions/filters/selectedSession/activePanel all wired end-to-end
- WebSocket connection to daemon live (from Phase 3 Plan 01)

Phase 4 (Codex Adapter) can proceed independently — no UI dependencies from Phase 3 block it.

**Checkpoint pending:** Task 3 is a human-verify checkpoint. Resume signal: type "approved" after verifying the UI in browser.

---
*Phase: 03-browser-ui-shell-session-management*
*Completed: 2026-04-05*
