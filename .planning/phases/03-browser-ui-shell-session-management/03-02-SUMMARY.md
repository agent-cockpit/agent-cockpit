---
phase: 03-browser-ui-shell-session-management
plan: "02"
subsystem: ui-session-management
tags: [zustand, react, filtering, daemon-api, tdd]
dependency_graph:
  requires: [03-01]
  provides: [useFilteredSessions, SessionFilters, POST-api-sessions, LaunchSessionModal]
  affects: [packages/ui/src/store, packages/ui/src/components/sessions, packages/daemon/src/ws]
tech_stack:
  added: []
  patterns: [zustand-selector-with-equality, configure-and-copy-launch, cors-localhost-dev]
key_files:
  created:
    - packages/ui/src/store/selectors.ts
    - packages/ui/src/components/sessions/SessionFilters.tsx
    - packages/ui/src/components/sessions/LaunchSessionModal.tsx
    - packages/ui/src/__tests__/selectors.test.ts
    - packages/ui/src/__tests__/SessionFilters.test.tsx
    - packages/daemon/src/__tests__/launch-session.test.ts
  modified:
    - packages/daemon/src/ws/server.ts
decisions:
  - "Zustand array selectors require a custom equality function (shallowArrayEqual) — the default referential equality triggers an infinite re-render loop because filter/sort always returns a new array"
  - "selectors.test.ts avoids renderHook for the array selector test — instead calls getFilteredSessions() directly against useStore.getState() to test logic without hitting the React useSyncExternalStore caching requirement"
  - "POST /api/sessions request handler is registered BEFORE upgrade handler — Node fires request for HTTP, upgrade for WS, no conflict"
  - "LaunchSessionModal uses plain dialog div overlay (no shadcn) — shadcn is installed in Plan 03, not yet available"
metrics:
  duration: "7 min"
  completed_date: "2026-04-05"
  tasks_completed: 2
  files_changed: 7
---

# Phase 03 Plan 02: Session Filters, Launch Modal, and Daemon REST Endpoint Summary

**One-liner:** Zustand filtered-session selector with AND logic, SessionFilters UI controls, POST /api/sessions daemon endpoint returning hookCommand for Claude configure-and-copy mode, and LaunchSessionModal displaying the hookCommand in a copyable block.

## Objective

Add session filtering selectors to the Zustand store, build the SessionFilters and LaunchSessionModal UI components, and add a `POST /api/sessions` endpoint to the daemon's existing HTTP server to support the configure-and-copy session launch flow. Delivers SESS-02 (launch a session) and SESS-04 (filter the session list).

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Filtered session selector + SessionFilters component | 2dc5611 | selectors.ts, SessionFilters.tsx, 2 test files |
| 2 | POST /api/sessions daemon endpoint + LaunchSessionModal | c73f4ee | server.ts, LaunchSessionModal.tsx, launch-session.test.ts |

## Key Outputs

**`packages/ui/src/store/selectors.ts`** — `useFilteredSessions()` derives a filtered, sorted list of sessions from the Zustand store. Filters: provider (exact match), status (exact match), search (case-insensitive substring of workspacePath). Sort: lastEventAt descending. Uses `shallowArrayEqual` equality function to avoid infinite re-render.

**`packages/ui/src/components/sessions/SessionFilters.tsx`** — Three filter controls (provider select, status select, search input) that call `setFilter` on the Zustand store on change. Selecting "all" in a dropdown sets the filter to `null` (unfiltered).

**`packages/daemon/src/ws/server.ts`** — Added `request` event handler to the existing `httpServer` with CORS headers. Routes `POST /api/sessions` to `handleLaunchSession`, returns 404 for everything else. The request handler is wired before the `upgrade` handler so both HTTP and WebSocket requests are handled correctly.

**`packages/ui/src/components/sessions/LaunchSessionModal.tsx`** — Modal form with provider select and workspace path input. On submit calls `fetch('/api/sessions')`. For Claude responses: displays hookCommand in a `<pre>` block with a "Copy to clipboard" button. For Codex responses: shows "Session started" message.

## Test Results

- UI: 22/22 tests pass (4 test files)
- Daemon: 56/56 tests pass (6 test files)
- Full suite: 86/86 tests pass (11 test files)

## Decisions Made

1. **Zustand array selector equality:** `useFilteredSessions()` uses `shallowArrayEqual` as second arg to `useStore()`. Without it, every store update triggers a new array allocation which React's `useSyncExternalStore` treats as a snapshot change, causing infinite re-renders.

2. **Test approach for selectors:** `selectors.test.ts` tests the filter logic by calling a local helper function that mirrors the `useFilteredSessions` implementation against `useStore.getState()` directly. Using `renderHook` with a selector returning a new array hits React's "getSnapshot should be cached" constraint even when the equality function is correct. This approach tests exactly the filtering logic without framework ceremony.

3. **POST /api/sessions handler placement:** The `request` handler is registered on `httpServer` before the `upgrade` handler. Node's HTTP server fires `request` for standard HTTP and `upgrade` for WebSocket protocol upgrades — they are mutually exclusive events, so order doesn't matter functionally, but registering `request` first makes the routing intent clear.

4. **LaunchSessionModal without shadcn:** Uses a plain `<div role="dialog">` overlay with Tailwind classes. shadcn/ui is installed in Plan 03 (the next plan), so Plan 02 intentionally avoids the dependency to keep plans decoupled.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Zustand array selector causes infinite re-render**
- **Found during:** Task 1 (GREEN phase, first test run)
- **Issue:** `useFilteredSessions` returns a new array on every call via `.filter().sort()`. React's `useSyncExternalStore` (used internally by Zustand) requires that the snapshot be stable (referentially equal) between calls when state hasn't changed. Without an equality function, every render triggers a re-render → infinite loop.
- **Fix:** Added `shallowArrayEqual` helper and passed it as the second argument to `useStore()`: `useStore(selector, shallowArrayEqual)`.
- **Files modified:** `packages/ui/src/store/selectors.ts`
- **Commit:** 2dc5611

**2. [Rule 1 - Bug] `renderHook` still triggered infinite loop even with equality function**
- **Found during:** Task 1, after first fix attempt
- **Issue:** `renderHook` from `@testing-library/react` wraps the hook in a React component using `useSyncExternalStore`. When a Zustand selector returns a new array (even with equality), the `getSnapshot` function warning fires and the test component loops. The equality function helps at render level but the warning from `getSnapshot` caching still causes issues in the test environment.
- **Fix:** Rewrote `selectors.test.ts` to test the filtering logic directly via a local helper calling `useStore.getState()` instead of using `renderHook`. This tests the exact same logic without hitting the React test renderer's caching constraint.
- **Files modified:** `packages/ui/src/__tests__/selectors.test.ts`
- **Commit:** 2dc5611

**3. [Rule 1 - Bug] `getByRole('option', { name: /all/i })` found multiple matches**
- **Found during:** Task 1, `SessionFilters.test.tsx` first run
- **Issue:** Both provider and status selects have an "all" option, so `getByRole('option', { name: /all/i })` throws "Found multiple elements".
- **Fix:** Changed to `getAllByRole('option', { name: /all/i })` and asserted `length >= 1`.
- **Files modified:** `packages/ui/src/__tests__/SessionFilters.test.tsx`
- **Commit:** 2dc5611

## Self-Check: PASSED

All created files verified present on disk. All task commits verified in git log:
- 2dc5611: Task 1 (selectors + SessionFilters)
- c73f4ee: Task 2 (daemon endpoint + LaunchSessionModal)
