---
phase: 03-browser-ui-shell-session-management
plan: 01
subsystem: ui
tags: [react, vite, zustand, react-router, tailwind, typescript, vitest, websocket]

# Dependency graph
requires:
  - phase: 01-daemon-core
    provides: NormalizedEvent schema, WebSocket server, sequenceNumber replay
  - phase: 02-claude-adapter-approval-foundation
    provides: approval_request/approval_resolved event types
provides:
  - packages/ui workspace package with Vite + React 18 + TypeScript
  - Combined Zustand store (sessionsSlice + uiSlice + wsSlice)
  - applyEventToSessions pure reducer handling 6 event-to-state transitions
  - connectDaemon WebSocket singleton with exponential backoff and SESS-03 catch-up
  - Five panel placeholder components (ApprovalInbox, Timeline, Diff, Memory, Artifacts)
  - React Router v7 Data Mode router with nested lazy panel routes
  - 11 passing unit tests covering SESS-01 and SESS-03 behaviors
affects:
  - 03-02 (session list and filter UI imports from store)
  - 03-03 (ops layout imports store + panels)
  - 04-codex-adapter (uses same store event interface)
  - 05-approval-ui (imports ApprovalInbox, reads wsSlice)

# Tech tracking
tech-stack:
  added:
    - vite@6
    - "@vitejs/plugin-react@4"
    - react@18.3
    - react-dom@18.3
    - react-router@7
    - zustand@5
    - tailwindcss@4 + "@tailwindcss/vite"
    - "@testing-library/react@16"
    - "@testing-library/jest-dom@6"
    - jsdom@25
    - vitest@3 (already in root, added per-package config)
  patterns:
    - Zustand flat combined store with subscribeWithSelector middleware
    - Pure applyEventToSessions reducer — session state derived from event stream, no sessions table
    - WebSocket singleton outside React (module-level) — survives component navigation
    - lastSeenSequence read at reconnect time (not module init) for SESS-03 attach-to-running-session
    - React Router v7 lazy routes return { Component } objects via destructured named exports

key-files:
  created:
    - packages/ui/package.json
    - packages/ui/index.html
    - packages/ui/vite.config.ts
    - packages/ui/tsconfig.json
    - packages/ui/vitest.config.ts
    - packages/ui/src/setupTests.ts
    - packages/ui/src/main.tsx
    - packages/ui/src/index.css
    - packages/ui/src/router.tsx
    - packages/ui/src/store/index.ts
    - packages/ui/src/store/sessionsSlice.ts
    - packages/ui/src/hooks/useSessionEvents.ts
    - packages/ui/src/components/layout/OpsLayout.tsx
    - packages/ui/src/components/layout/SessionDetailPanel.tsx
    - packages/ui/src/components/panels/ApprovalInbox.tsx
    - packages/ui/src/components/panels/TimelinePanel.tsx
    - packages/ui/src/components/panels/DiffPanel.tsx
    - packages/ui/src/components/panels/MemoryPanel.tsx
    - packages/ui/src/components/panels/ArtifactsPanel.tsx
    - packages/ui/src/__tests__/sessionsSlice.test.ts
    - packages/ui/src/__tests__/wsSlice.test.ts
  modified: []

key-decisions:
  - "packages/ui tsconfig uses module=ESNext + moduleResolution=Bundler (not NodeNext) — Vite is the bundler, no .js extension required in TS source"
  - "vite/client added to tsconfig types array for import.meta.env support"
  - "React Router v7 lazy route functions destructure named exports and return { Component } — avoids type mismatch with LazyRouteFunction signature"
  - "SessionDetailPanel shell created (not in plan) as required by router nested route structure"
  - "Panel default exports removed — lazy loaders use destructured named exports directly"

patterns-established:
  - "Pattern: applyEventToSessions is a pure function — takes state + event, returns new state. No side effects. Replay-safe."
  - "Pattern: connectDaemon reads useStore.getState() at call time, never at module init — ensures lastSeenSequence is current on reconnect"
  - "Pattern: WebSocket singleton at module level (ws, retries, retryTimer) — one connection per app instance"

requirements-completed:
  - SESS-01
  - SESS-03

# Metrics
duration: 7min
completed: 2026-04-05
---

# Phase 3 Plan 01: UI Foundation Summary

**Zustand store with pure event-to-session reducer, WebSocket singleton with SESS-03 catch-up replay, and React Router v7 SPA shell — 11 tests green**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-05T05:49:03Z
- **Completed:** 2026-04-05T05:56:00Z
- **Tasks:** 2
- **Files modified:** 21

## Accomplishments

- Scaffolded `packages/ui` as a Vite 6 + React 18 + TypeScript workspace package with Tailwind v4 and Vitest jsdom
- Implemented combined Zustand 5 store with sessionsSlice (applyEventToSessions pure reducer), uiSlice, and wsSlice; 11 tests green covering SESS-01 and SESS-03
- Built connectDaemon WebSocket singleton that reads lastSeenSequence at call time for correct reconnect/catch-up behavior; five panel placeholders and router with lazy nested routes

## Task Commits

1. **Task 1: Scaffold packages/ui and implement Zustand store with sessionsSlice** - `30f3094` (feat)
2. **Task 2: React app entrypoint, router skeleton, WebSocket connection hook, and panel placeholders** - `e48d02e` (feat)

## Files Created/Modified

- `packages/ui/package.json` - Workspace package definition with all deps
- `packages/ui/vite.config.ts` - Vite 6 + plugin-react + tailwindcss/vite
- `packages/ui/tsconfig.json` - ESNext/Bundler moduleResolution, vite/client types
- `packages/ui/vitest.config.ts` - jsdom environment, setupFiles
- `packages/ui/src/store/sessionsSlice.ts` - Pure applyEventToSessions reducer
- `packages/ui/src/store/index.ts` - Combined Zustand store with subscribeWithSelector
- `packages/ui/src/hooks/useSessionEvents.ts` - connectDaemon singleton + useSessionEvents hook
- `packages/ui/src/router.tsx` - createBrowserRouter with lazy panel routes
- `packages/ui/src/main.tsx` - ReactDOM.createRoot + RouterProvider + useSessionEvents
- `packages/ui/src/components/layout/OpsLayout.tsx` - Two-column layout shell
- `packages/ui/src/components/layout/SessionDetailPanel.tsx` - Nested outlet shell
- `packages/ui/src/components/panels/*.tsx` - Five empty-state panel placeholders
- `packages/ui/src/__tests__/sessionsSlice.test.ts` - 7 tests: SESS-01 + SESS-03 behaviors
- `packages/ui/src/__tests__/wsSlice.test.ts` - 4 tests: WS status transitions

## Decisions Made

- Used `module: ESNext` + `moduleResolution: Bundler` in tsconfig (not NodeNext) since Vite handles bundling — avoids .js extension requirements in TSX imports
- Added `types: ["vite/client"]` to tsconfig for `import.meta.env` support
- React Router v7 lazy functions return `{ Component: NamedExport }` objects (not module namespace objects) to satisfy `LazyRouteFunction` type constraint
- Created `SessionDetailPanel` (not explicitly in plan) as the necessary parent outlet wrapper for nested panel routes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed import.meta.env TypeScript error in useSessionEvents.ts**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** `Property 'env' does not exist on type 'ImportMeta'` — tsconfig lacked Vite client type declarations
- **Fix:** Added `"types": ["vite/client"]` to tsconfig compilerOptions
- **Files modified:** `packages/ui/tsconfig.json`
- **Verification:** `pnpm --filter @cockpit/ui typecheck` exits 0
- **Committed in:** e48d02e (Task 2 commit)

**2. [Rule 1 - Bug] Fixed React Router lazy route type mismatch**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** Panel default exports `{ Component: Foo }` did not satisfy `LazyRouteFunction<BaseRouteObject>` — TS2322 on all 5 panel routes
- **Fix:** Changed lazy loaders from `import('./Panel.js')` (whole module) to `async () => { const { Panel } = await import(...); return { Component: Panel } }` using named export destructuring
- **Files modified:** `packages/ui/src/router.tsx`, all 5 panel files (removed redundant default exports)
- **Verification:** `pnpm --filter @cockpit/ui typecheck` exits 0
- **Committed in:** e48d02e (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 × Rule 1 - Bug in typecheck)
**Impact on plan:** Both fixes required for correct TypeScript compilation. No behavior changes, no scope creep.

## Issues Encountered

None — test infrastructure worked first try, store implementation matched plan patterns exactly.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `packages/ui` package exists with passing tests — Plans 02 and 03 can import from `@cockpit/ui` store
- `applyEventToSessions` is proven correct for all event types including catch-up replay (SESS-03)
- Panel placeholders exist with named exports ready for Plan 03 implementation
- `pnpm --filter @cockpit/ui test --run` and `typecheck` both exit 0

## Self-Check: PASSED

- FOUND: packages/ui/src/store/sessionsSlice.ts
- FOUND: packages/ui/src/hooks/useSessionEvents.ts
- FOUND: packages/ui/src/router.tsx
- FOUND: commit 30f3094 (Task 1)
- FOUND: commit e48d02e (Task 2)

---
*Phase: 03-browser-ui-shell-session-management*
*Completed: 2026-04-05*
