---
phase: 03-browser-ui-shell-session-management
verified: 2026-04-05T22:10:00Z
status: human_needed
score: 17/17 must-haves verified
re_verification: false
human_verification:
  - test: "Open http://localhost:5173 and verify session list, launch modal, and panel navigation"
    expected: "Sidebar shows sessions + filters + Launch button; clicking a session shows detail panel with 5 tabs; each tab renders its empty state; LaunchSessionModal opens, shows hookCommand for Claude"
    why_human: "Visual correctness, navigation flow, and real-time WebSocket session appearance cannot be verified programmatically"
---

# Phase 3: Browser UI Shell & Session Management — Verification Report

**Phase Goal:** The browser shows live Claude Code sessions, lets the user filter the list, and provides the Ops mode layout with working navigation between session detail, approval inbox, timeline, diff, memory, and artifacts panels — even before those panels are fully populated.
**Verified:** 2026-04-05T22:10:00Z
**Status:** human_needed (all automated checks pass; visual/runtime behavior needs human checkpoint)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Opening localhost shows the Cockpit UI (Vite dev server serves React app) | ✓ VERIFIED | `packages/ui/main.tsx` mounts `<App>` with `RouterProvider`; Vite + `@vitejs/plugin-react` wired in `vite.config.ts` |
| 2 | Session map in the store updates when a `session_start` event is applied | ✓ VERIFIED | `applyEventToSessions` in `sessionsSlice.ts` handles `session_start`; 7 passing unit tests confirm |
| 3 | Session status transitions to `ended` when a `session_end` event is applied | ✓ VERIFIED | `sessionsSlice.ts` L33-39; test "sets status to ended on session_end for existing session" passes |
| 4 | Pending approvals count increments/decrements correctly on approval events | ✓ VERIFIED | `sessionsSlice.ts` L44-66; 2 explicit tests for increment and decrement with floor-at-0 |
| 5 | WebSocket reconnect reads `lastSeenSequence` from store at reconnect time, not module init | ✓ VERIFIED | `useSessionEvents.ts` L29-30: `useStore.getState()` called inside `connectDaemon()`, not at module scope; code comment explicitly documents this |
| 6 | SESS-03: UI opening during a running session replays from `lastSeenSequence=0`, reconstructing all prior state | ✓ VERIFIED | `sessionsSlice.test.ts` L156-202 "SESS-03: replaying a sequence from sequenceNumber=0 builds correct session state" passes |
| 7 | Filtered session list respects provider, status, and search filters | ✓ VERIFIED | `selectors.ts` filter logic; 6 passing tests in `selectors.test.ts` covering AND logic and recency sort |
| 8 | `POST /api/sessions` returns 200 with `sessionId` + `hookCommand` for Claude | ✓ VERIFIED | `daemon/src/ws/server.ts` L8-38 `handleLaunchSession`; 6 passing daemon tests in `launch-session.test.ts` |
| 9 | `POST /api/sessions` returns 400 for missing fields | ✓ VERIFIED | `server.ts` L13-17; test "returns 400 for missing provider" and "returns 400 for missing workspacePath" pass |
| 10 | OpsLayout renders fixed sidebar + main area with Outlet | ✓ VERIFIED | `OpsLayout.tsx` 18 lines — `<aside w-72>` + `<main flex-1>` with `<Outlet>`; 6 OpsLayout tests pass |
| 11 | SessionListPanel shows all sessions as SessionCard rows with filters + Launch button | ✓ VERIFIED | `SessionListPanel.tsx` — renders `<SessionFilters>`, "Launch Session" button, `SessionCard` per session, empty state text; 7 SessionListPanel tests pass |
| 12 | Clicking a SessionCard calls `selectSession` and navigates to `/session/:id/approvals` | ✓ VERIFIED | `SessionListPanel.tsx` L15-17 `handleCardClick`; test "clicking a session card calls selectSession" passes |
| 13 | Switching sessions does NOT reset `activePanel` (OPS-03) | ✓ VERIFIED | `uiSlice.test.ts` L31-40 OPS-03 test passes; `selectSession` action only sets `selectedSessionId`, does not touch `activePanel` |
| 14 | Panel tabs (approvals/timeline/diff/memory/artifacts) visible and navigable via NavLink | ✓ VERIFIED | `SessionDetailPanel.tsx` L6-12 `TABS` array; L77-93 renders `<NavLink>` per tab to `/session/:id/{panel}` |
| 15 | Each panel renders an empty state rather than an error | ✓ VERIFIED | All 5 panel files (`ApprovalInbox`, `TimelinePanel`, `DiffPanel`, `MemoryPanel`, `ArtifactsPanel`) return centered placeholder content — not `null`, not errors |
| 16 | SessionFilters wired into sidebar | ✓ VERIFIED | `SessionListPanel.tsx` L5 imports `SessionFilters`; L22 renders `<SessionFilters />` at top |
| 17 | LaunchSessionModal reachable from browser via Launch Session button | ✓ VERIFIED | `SessionListPanel.tsx` L13 `useState(false)`; L28-31 button sets `launchOpen=true`; L49 `<LaunchSessionModal open={launchOpen}>` |

**Score: 17/17 truths verified**

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `packages/ui/vite.config.ts` | VERIFIED | Vite config with `react()` and `tailwindcss()` plugins; `@` path alias |
| `packages/ui/vitest.config.ts` | VERIFIED | jsdom environment, `setupFiles`, react plugin |
| `packages/ui/src/store/index.ts` | VERIFIED | Combined Zustand store (sessionsSlice + uiSlice + wsSlice) with `subscribeWithSelector`; exports `useStore`, `SessionRecord`, `SessionStatus`, `PanelId` |
| `packages/ui/src/store/sessionsSlice.ts` | VERIFIED | Pure `applyEventToSessions` reducer; handles 5 event types + no-op default; replay-safe; SESS-03 comment present |
| `packages/ui/src/hooks/useSessionEvents.ts` | VERIFIED | `connectDaemon()` singleton + `useSessionEvents` hook; reads `lastSeenSequence` at call time; exponential backoff with MAX_RETRIES=12 |
| `packages/ui/src/store/selectors.ts` | VERIFIED | `useFilteredSessions()` with `useRef` memoization for React 18 snapshot stability; provider/status/search AND filters; lastEventAt descending sort |
| `packages/ui/src/components/sessions/SessionFilters.tsx` | VERIFIED | 3 controls (provider select, status select, search input); calls `setFilter` on change; "all" maps to `null` |
| `packages/ui/src/components/sessions/LaunchSessionModal.tsx` | VERIFIED | `open/onClose` props; POSTs to `/api/sessions`; shows `hookCommand` in `<pre>` with clipboard button for Claude; "Session started" for Codex |
| `packages/daemon/src/ws/server.ts` | VERIFIED | `request` handler wired before `upgrade` handler; `POST /api/sessions` → `handleLaunchSession`; returns 200 + `sessionId` + `hookCommand` for Claude, 400 for missing fields, 404 for all other routes |
| `packages/ui/src/components/layout/OpsLayout.tsx` | VERIFIED | Full two-column shell: `w-72` fixed sidebar + `Outlet` main area; imports `SessionListPanel` |
| `packages/ui/src/components/layout/SessionListPanel.tsx` | VERIFIED | `useFilteredSessions()`, `SessionFilters`, "Launch Session" button, `LaunchSessionModal` mounted with `useState`-controlled `open` prop, `SessionCard` list, empty state |
| `packages/ui/src/components/layout/SessionDetailPanel.tsx` | VERIFIED | Header with provider badge/title/status/startedAt; 5 `NavLink` tabs; `<Outlet>` for panel routes; syncs `activePanel` to store on mount (OPS-03) |
| `packages/ui/src/components/sessions/SessionCard.tsx` | VERIFIED | Provider badge (blue/purple), `workspacePath.split('/').at(-1)` as project name, status dot (green/gray/red), pendingApprovals badge (hidden when 0), `selected` highlight |
| `packages/ui/src/components/panels/ApprovalInbox.tsx` | VERIFIED | Named export `ApprovalInbox`; empty state with text content |
| `packages/ui/src/components/panels/TimelinePanel.tsx` | VERIFIED | Named export `TimelinePanel`; empty state with text content |
| `packages/ui/src/components/panels/DiffPanel.tsx` | VERIFIED | Named export `DiffPanel`; empty state with text content |
| `packages/ui/src/components/panels/MemoryPanel.tsx` | VERIFIED | Named export `MemoryPanel`; empty state with text content |
| `packages/ui/src/components/panels/ArtifactsPanel.tsx` | VERIFIED | Named export `ArtifactsPanel`; empty state with text content |
| `packages/ui/src/router.tsx` | VERIFIED | `createBrowserRouter` with `OpsLayout` root, index route, `session/:sessionId` with `SessionDetailPanel`, 5 lazy panel child routes including index defaulting to `ApprovalInbox` |
| `packages/ui/src/__tests__/sessionsSlice.test.ts` | VERIFIED | 7 tests: session_start, session_end, approval_request, approval_resolved, unknown event, no-op on unknown id, SESS-03 catch-up replay |
| `packages/ui/src/__tests__/uiSlice.test.ts` | VERIFIED | 5 tests: initial values, selectSession, setActivePanel, OPS-03 no panel reset on session switch |
| `packages/daemon/src/__tests__/launch-session.test.ts` | VERIFIED | 6 tests: 200 for Claude (with hookCommand), 200 for Codex, 400 for missing workspacePath, 400 for missing provider, 404 for GET, hookCommand includes COCKPIT_HOOK_PORT |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `main.tsx` | `router.tsx` | `RouterProvider` from `react-router` | WIRED | L3 imports `RouterProvider`; L10 `<RouterProvider router={router}>` |
| `hooks/useSessionEvents.ts` | `store/index.ts` | `useStore.getState()` at reconnect | WIRED | L29-30 reads `lastSeenSequence` inside `connectDaemon()` body, not at module scope |
| `store/index.ts` | `store/sessionsSlice.ts` | `applyEvent` calls `applyEventToSessions` | WIRED | L4 imports `applyEventToSessions`; L47 `set((state) => applyEventToSessions(state, event))` |
| `SessionFilters.tsx` | `store/index.ts` | `useStore` → `setFilter` action | WIRED | L1 imports `useStore`; L4-5 reads filters + setFilter; L8/12/16 calls `setFilter` on each control change |
| `selectors.ts` | `store/index.ts` | `useStore` reads sessions + filters | WIRED | L2 imports `useStore`; L33-34 `useStore((state) => { ... state.sessions, state.filters ... })` |
| `LaunchSessionModal.tsx` | `daemon/src/ws/server.ts` | `fetch POST /api/sessions` | WIRED | L29-33: `fetch('/api/sessions', { method: 'POST', ... })` |
| `SessionListPanel.tsx` | `selectors.ts` | `useFilteredSessions()` | WIRED | L4 imports; L11 `const sessions = useFilteredSessions()` |
| `SessionListPanel.tsx` | `LaunchSessionModal.tsx` | `useState`-controlled `open` prop | WIRED | L13 `useState(false)`; L49 `<LaunchSessionModal open={launchOpen} onClose={...}>` |
| `SessionDetailPanel.tsx` | `store/index.ts` | `useStore` reads `sessions[sessionId]` | WIRED | L27 `useStore((s) => s.sessions[sessionId])` |
| `SessionDetailPanel.tsx` | React Router `<Outlet>` | Nested panel child routes | WIRED | L97 `<Outlet />` below tab strip; router.tsx wires 5 lazy panel routes as children of `session/:sessionId` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SESS-01 | 03-01 | User can see all active Claude Code and Codex sessions in one UI | SATISFIED | Store derives sessions from NormalizedEvent stream; SessionListPanel renders all sessions; 7 sessionsSlice tests green |
| SESS-02 | 03-02, 03-03 | User can launch a new session from the browser UI | SATISFIED | "Launch Session" button in sidebar; LaunchSessionModal POSTs to `/api/sessions`; Claude mode returns hookCommand; daemon endpoint tested with 6 tests |
| SESS-03 | 03-01 | User can attach to an already-running session | SATISFIED | `connectDaemon()` reads `lastSeenSequence` at call time; with `lastSeenSequence=0` daemon replays all events; SESS-03 catch-up test covers this path |
| SESS-04 | 03-02 | User can filter the session list | SATISFIED | `SessionFilters` with provider/status/search controls wired to `setFilter`; `useFilteredSessions()` applies AND logic + recency sort; 5 filter tests + 5 SessionFilters component tests green |
| OPS-01 | 03-03 | User can see session list panel with status indicators | SATISFIED | `SessionListPanel` renders `SessionCard` per session; status dot (green/gray/red) and provider badge visible on each card |
| OPS-02 | 03-03 | User can select session and see detail panel | SATISFIED | Clicking `SessionCard` → `selectSession` + navigate to `/session/:id/approvals`; `SessionDetailPanel` shows provider badge, project name, status dot, startedAt timestamp |
| OPS-03 | 03-03 | User can switch sessions without losing panel state | SATISFIED | `selectSession` only sets `selectedSessionId`; `activePanel` unchanged; uiSlice OPS-03 test explicitly verifies; `SessionDetailPanel` syncs store on mount from URL |
| OPS-04 | 03-03 | User can navigate between Ops mode panels | SATISFIED | 5 `NavLink` tabs in `SessionDetailPanel` each route to `/session/:id/{panel}`; 5 lazy-loaded panel child routes in router; each panel renders empty state without error |

**All 8 required requirements satisfied.**

---

### Anti-Patterns Found

None detected. Scan of all phase-modified files found:
- No `TODO/FIXME/HACK/PLACEHOLDER/XXX` comments in source (only in tests where expected)
- No `return null` or `return {}` stub implementations
- No empty handler stubs (`onClick={() => {}}` or `onSubmit={(e) => e.preventDefault()}` without action)
- All panels return substantive content (empty-state UI, not `null`)

---

### Test Results

| Package | Tests | Files | Result |
|---------|-------|-------|--------|
| `@cockpit/ui` | 40/40 | 7 | PASS |
| `@cockpit/daemon` | 56/56 | 6 | PASS |
| TypeScript (`@cockpit/ui`) | — | — | EXIT 0 |

**Total: 96 tests passing across both packages. TypeScript compilation clean.**

---

### Human Verification Required

#### 1. Browser UI Visual and Runtime Verification

**Test:**
1. Start daemon: `pnpm --filter @cockpit/daemon dev`
2. Start UI: `pnpm --filter @cockpit/ui dev`
3. Open http://localhost:5173

**Expected:**
- "Agent Cockpit" heading visible in the left sidebar
- "No sessions" empty state text visible, "Launch Session" button present
- Provider/status filter controls and search input visible
- Clicking "Launch Session" opens LaunchSessionModal as overlay
- Selecting provider=claude, entering a workspace path, submitting shows a hookCommand in `<pre>` block with "Copy to clipboard" button
- After configuring Claude hooks and starting a session: session card appears in sidebar with provider badge and status dot
- Clicking a session card: detail panel shows project name, provider badge, status, timestamp, and 5 tab links
- Clicking each tab (Timeline, Diff, Memory, Artifacts) renders the correct empty state text without errors

**Why human:** Visual layout correctness, real-time WebSocket session appearance, modal overlay behavior, clipboard API interaction, and navigation flow cannot be verified programmatically.

---

### Summary

All 17 observable truths are verified in code. All 8 requirements (SESS-01, SESS-02, SESS-03, SESS-04, OPS-01, OPS-02, OPS-03, OPS-04) are satisfied by real implementations with test coverage. The human checkpoint from plan 03 task 3 is the only remaining gate.

The phase goal is structurally achieved: the browser UI scaffolding is complete, the store derives session state from the WebSocket event stream, filters work, the Ops layout shell is in place with 5-tab navigation, and each panel renders an empty state ready for population in later phases.

---

_Verified: 2026-04-05T22:10:00Z_
_Verifier: Claude (gsd-verifier)_
