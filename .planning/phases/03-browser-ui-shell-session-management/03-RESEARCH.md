# Phase 3: Browser UI Shell + Session Management - Research

**Researched:** 2026-04-05
**Domain:** React/Vite SPA, Zustand state management, WebSocket client, session lifecycle, multi-panel layout
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SESS-01 | User can see all active Claude Code and Codex sessions discovered automatically in one UI | WebSocket client subscribes to daemon events; session store derived from `session_start`/`session_end` events |
| SESS-02 | User can launch a new Claude or Codex session from the browser UI by selecting a repo and provider | New `/api/sessions` POST endpoint added to daemon HTTP server; UI form → fetch call |
| SESS-03 | User can attach to an already-running session and begin receiving its events | WebSocket reconnect with `lastSeenSequence`; daemon already supports catch-up replay |
| SESS-04 | User can filter the session list by project, provider, status, and recency | Derived selector in Zustand store; filter state lives in store slice |
| OPS-01 | User can see a session list panel in Ops mode showing all sessions with status indicators | CSS layout with fixed left sidebar; session list component reads from store |
| OPS-02 | User can select a session and see its detail panel with task, provider, repo/branch, start time, and status | Selected session ID in store; detail panel reads from store |
| OPS-03 | User can switch between sessions quickly without losing context or panel state | Per-session panel state stored in Zustand keyed by sessionId; switching only updates selectedSessionId |
| OPS-04 | User can navigate between Ops mode panels: approval inbox, timeline, diff viewer, memory, and artifacts/log | Tab/panel navigation component; each panel renders empty-state placeholder when no data |
</phase_requirements>

---

## Summary

Phase 3 introduces the browser UI as a new `packages/ui` workspace package — a Vite 8 + React 18 + TypeScript SPA. The daemon (already built in Phases 1–2) becomes the sole data source: the UI connects over WebSocket and derives all session state from the normalized event stream. No new daemon persistence is required except one new REST endpoint for launching sessions.

The central architectural challenge is driving a rich multi-panel layout from an append-only event stream with no dedicated "sessions" table. The solution is a Zustand 5 store that builds a session map by processing `session_start` and `session_end` events as they arrive, maintaining session state reactively. Filtering, selection, and per-session panel state all live in this store.

The stack is prescribed in PROJECT.md: React + Vite + Zustand. For this phase, the router is React Router v7 in Data Mode (`createBrowserRouter`), UI components come from shadcn/ui with Tailwind CSS v4, and testing is Vitest + React Testing Library with jsdom.

**Primary recommendation:** Scaffold `packages/ui` as a Vite 8 React TypeScript app, wire a single Zustand store with a WebSocket connection slice and a sessions slice, build the two-column Ops layout (session list + right panel with tab strip), and add a `/api/sessions` POST endpoint to the daemon's existing HTTP server.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vite | ^8.0.0 | Build tool + dev server | Prescribed in PROJECT.md; Rolldown bundler, fastest HMR |
| @vitejs/plugin-react | ^6.0.0 | JSX transform, Fast Refresh | Official plugin; uses Oxc (no Babel dep) in v6 |
| react | ^18.3.0 | UI framework | Prescribed; Zustand v5 requires React 18+ |
| react-dom | ^18.3.0 | DOM renderer | Pairs with react |
| typescript | ^5.0.0 | Already in workspace root | Matches existing tsconfig.base.json |
| zustand | ^5.0.11 | Client state management | Prescribed in PROJECT.md; v5 is current stable |
| react-router | ^7.0.0 | SPA routing + nested layouts | React Router v7 allows importing from "react-router" directly |
| tailwindcss | ^4.0.0 | Utility CSS | Prescribed; v4 integrates via @tailwindcss/vite plugin |
| @tailwindcss/vite | ^4.0.0 | Vite integration for Tailwind v4 | No PostCSS config needed; adds @import "tailwindcss" to CSS |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui (components copied) | latest | Pre-built accessible UI components | Dashboard shell, sidebar, tabs, badges, dialogs |
| @radix-ui/* | latest (via shadcn) | Headless primitives under shadcn | Indirect dependency via shadcn copy-paste |
| clsx / tailwind-merge | latest (via shadcn) | Conditional classnames | Used in shadcn component wrappers |
| @testing-library/react | ^16.0.0 | Component test utilities | All UI unit tests |
| @testing-library/user-event | ^14.0.0 | Simulated user interactions | Filter, click, navigation tests |
| @testing-library/jest-dom | ^6.0.0 | DOM assertion matchers | Extends Vitest's expect |
| jsdom | ^25.0.0 | Browser DOM in Node | Vitest environment for UI tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| React Router v7 | TanStack Router | TanStack has better type safety but more setup; React Router v7 Data Mode is sufficient for this layout complexity and is more familiar |
| shadcn/ui | Chakra UI / MUI | shadcn has zero runtime bundle; copy-paste model avoids versioning; Tailwind v4 integration is first-class |
| Zustand | Jotai / Redux | Zustand has the most direct WebSocket integration pattern; PROJECT.md prescribes it |
| jsdom | Vitest Browser Mode (Playwright) | Browser mode is more accurate but heavier; jsdom sufficient for store/component unit tests in this phase |

**Installation:**
```bash
# From monorepo root
pnpm create vite packages/ui --template react-ts
# Then add to packages/ui/package.json dependencies:
pnpm --filter @cockpit/ui add react-router zustand tailwindcss @tailwindcss/vite
pnpm --filter @cockpit/ui add -D @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
pnpm --filter @cockpit/ui add @cockpit/shared
# shadcn/ui: run init, then add components individually
pnpm dlx shadcn@latest init  # from packages/ui
pnpm dlx shadcn@latest add badge button tabs card scroll-area separator
```

---

## Architecture Patterns

### Recommended Project Structure
```
packages/ui/
├── index.html
├── vite.config.ts          # @vitejs/plugin-react + @tailwindcss/vite
├── tsconfig.json           # extends ../../tsconfig.base.json
├── vitest.config.ts        # separate from vite.config.ts, jsdom env
├── package.json
└── src/
    ├── main.tsx            # ReactDOM.createRoot + RouterProvider
    ├── router.tsx          # createBrowserRouter definition
    ├── index.css           # @import "tailwindcss"
    ├── store/
    │   ├── index.ts        # re-exports all slices
    │   ├── sessionsSlice.ts # session map + status derived from events
    │   ├── wsSlice.ts      # WebSocket connection state + connect/disconnect
    │   └── uiSlice.ts      # selectedSessionId, filters, active panel
    ├── hooks/
    │   └── useSessionEvents.ts # subscribes to WS, dispatches to store
    ├── components/
    │   ├── layout/
    │   │   ├── OpsLayout.tsx       # two-column shell
    │   │   ├── SessionListPanel.tsx
    │   │   └── SessionDetailPanel.tsx
    │   ├── sessions/
    │   │   ├── SessionCard.tsx
    │   │   ├── SessionFilters.tsx
    │   │   └── LaunchSessionModal.tsx
    │   └── panels/
    │       ├── ApprovalInbox.tsx   # empty state for Phase 3
    │       ├── TimelinePanel.tsx   # empty state for Phase 3
    │       ├── DiffPanel.tsx       # empty state for Phase 3
    │       ├── MemoryPanel.tsx     # empty state for Phase 3
    │       └── ArtifactsPanel.tsx  # empty state for Phase 3
    └── __tests__/
        ├── sessionsSlice.test.ts
        ├── SessionFilters.test.tsx
        └── OpsLayout.test.tsx
```

### Pattern 1: Zustand Store with Combined Slices
**What:** Combine multiple state slices into one Zustand store using a flat structure; expose typed selectors.
**When to use:** Any time state crosses component boundaries (session list → detail panel → filters).

```typescript
// Source: https://zustand.docs.pmnd.rs/learn/getting-started/introduction
// packages/ui/src/store/index.ts
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { NormalizedEvent } from '@cockpit/shared'

export type SessionStatus = 'active' | 'ended' | 'error'

export interface SessionRecord {
  sessionId: string
  provider: 'claude' | 'codex'
  workspacePath: string
  startedAt: string
  status: SessionStatus
  lastEventAt: string
  pendingApprovals: number
}

export type PanelId = 'approvals' | 'timeline' | 'diff' | 'memory' | 'artifacts'

interface SessionsSlice {
  sessions: Record<string, SessionRecord>
  applyEvent: (event: NormalizedEvent) => void
}

interface UiSlice {
  selectedSessionId: string | null
  activePanel: PanelId
  filters: { provider: string | null; status: string | null; search: string }
  selectSession: (id: string) => void
  setActivePanel: (panel: PanelId) => void
  setFilter: (key: string, value: string | null) => void
}

interface WsSlice {
  wsStatus: 'disconnected' | 'connecting' | 'connected'
  lastSeenSequence: number
  setWsStatus: (s: WsSlice['wsStatus']) => void
  recordSequence: (n: number) => void
}

export type AppStore = SessionsSlice & UiSlice & WsSlice

export const useStore = create<AppStore>()(
  subscribeWithSelector((set) => ({
    // sessionsSlice
    sessions: {},
    applyEvent: (event) => set((state) => applyEventToSessions(state, event)),

    // uiSlice
    selectedSessionId: null,
    activePanel: 'approvals',
    filters: { provider: null, status: null, search: '' },
    selectSession: (id) => set({ selectedSessionId: id }),
    setActivePanel: (panel) => set({ activePanel: panel }),
    setFilter: (key, value) =>
      set((s) => ({ filters: { ...s.filters, [key]: value } })),

    // wsSlice
    wsStatus: 'disconnected',
    lastSeenSequence: 0,
    setWsStatus: (s) => set({ wsStatus: s }),
    recordSequence: (n) => set({ lastSeenSequence: n }),
  }))
)
```

### Pattern 2: Deriving Session State from Events
**What:** The store has no separate "sessions table" — sessions are derived by processing `session_start` / `session_end` / `approval_request` / `approval_resolved` events as they stream in.
**When to use:** Every time an event arrives from the WebSocket.

```typescript
// packages/ui/src/store/sessionsSlice.ts
import type { NormalizedEvent } from '@cockpit/shared'
import type { AppStore, SessionRecord } from './index.js'

export function applyEventToSessions(
  state: Pick<AppStore, 'sessions'>,
  event: NormalizedEvent,
): Pick<AppStore, 'sessions'> {
  const sessions = { ...state.sessions }
  const now = event.timestamp

  switch (event.type) {
    case 'session_start':
      sessions[event.sessionId] = {
        sessionId: event.sessionId,
        provider: event.provider,
        workspacePath: event.workspacePath,
        startedAt: event.timestamp,
        status: 'active',
        lastEventAt: now,
        pendingApprovals: 0,
      }
      break
    case 'session_end':
      if (sessions[event.sessionId]) {
        sessions[event.sessionId] = {
          ...sessions[event.sessionId]!,
          status: 'ended',
          lastEventAt: now,
        }
      }
      break
    case 'approval_request':
      if (sessions[event.sessionId]) {
        sessions[event.sessionId] = {
          ...sessions[event.sessionId]!,
          pendingApprovals: (sessions[event.sessionId]!.pendingApprovals ?? 0) + 1,
          lastEventAt: now,
        }
      }
      break
    case 'approval_resolved':
      if (sessions[event.sessionId]) {
        const prev = sessions[event.sessionId]!
        sessions[event.sessionId] = {
          ...prev,
          pendingApprovals: Math.max(0, prev.pendingApprovals - 1),
          lastEventAt: now,
        }
      }
      break
    default:
      if (sessions[event.sessionId]) {
        sessions[event.sessionId] = {
          ...sessions[event.sessionId]!,
          lastEventAt: now,
        }
      }
  }

  return { sessions }
}
```

### Pattern 3: WebSocket Connection Hook (Outside React, Vanilla Store)
**What:** Manage the WebSocket lifecycle outside React components using Zustand's `getState`/`setState` directly, so the connection survives component unmounts.
**When to use:** App-level singleton connection — open once at startup, survive navigation.

```typescript
// packages/ui/src/hooks/useSessionEvents.ts
import { useEffect } from 'react'
import { useStore } from '../store/index.js'

const WS_URL = import.meta.env['VITE_WS_URL'] ?? 'ws://localhost:3001'
const MAX_RETRIES = 12

let ws: WebSocket | null = null
let retries = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null

export function connectDaemon(): void {
  const { setWsStatus, recordSequence, applyEvent, lastSeenSequence } =
    useStore.getState()

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return
  }

  setWsStatus('connecting')
  const url = `${WS_URL}?lastSeenSequence=${lastSeenSequence}`
  ws = new WebSocket(url)

  ws.onopen = () => {
    retries = 0
    setWsStatus('connected')
  }

  ws.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data as string)
      if (typeof event.sequenceNumber === 'number') {
        recordSequence(event.sequenceNumber)
      }
      applyEvent(event)
    } catch { /* ignore malformed */ }
  }

  ws.onclose = () => {
    setWsStatus('disconnected')
    ws = null
    if (retries < MAX_RETRIES) {
      const delay = Math.min(500 * 2 ** retries + Math.random() * 200, 30_000)
      retries++
      retryTimer = setTimeout(connectDaemon, delay)
    }
  }

  ws.onerror = () => {
    ws?.close()
  }
}

// React hook — call once at app root
export function useSessionEvents(): void {
  useEffect(() => {
    connectDaemon()
    return () => {
      if (retryTimer) clearTimeout(retryTimer)
      ws?.close()
    }
  }, [])
}
```

### Pattern 4: React Router v7 Data Mode Nested Layout
**What:** Use `createBrowserRouter` with nested routes so OpsLayout wraps all session-detail views; panel switching happens via child routes under `/ops/:sessionId`.
**When to use:** All navigation in this phase.

```typescript
// packages/ui/src/router.tsx
import { createBrowserRouter } from 'react-router'
import { OpsLayout } from './components/layout/OpsLayout.js'
import { SessionDetailPanel } from './components/layout/SessionDetailPanel.js'

export const router = createBrowserRouter([
  {
    path: '/',
    Component: OpsLayout,   // left sidebar (session list) + right panel area
    children: [
      { index: true, Component: () => <div className="flex-1 flex items-center justify-center text-muted-foreground">Select a session</div> },
      {
        path: 'session/:sessionId',
        Component: SessionDetailPanel,
        children: [
          { path: 'approvals', lazy: () => import('./components/panels/ApprovalInbox.js') },
          { path: 'timeline',  lazy: () => import('./components/panels/TimelinePanel.js') },
          { path: 'diff',      lazy: () => import('./components/panels/DiffPanel.js') },
          { path: 'memory',    lazy: () => import('./components/panels/MemoryPanel.js') },
          { path: 'artifacts', lazy: () => import('./components/panels/ArtifactsPanel.js') },
        ],
      },
    ],
  },
])
```

### Pattern 5: Session Launch — New Daemon REST Endpoint
**What:** SESS-02 requires launching a new Claude/Codex session. The daemon's existing `httpServer` (already on port 3001 as an HTTP server backing the WebSocket) needs a `POST /api/sessions` route.
**When to use:** When the user submits the Launch Session modal.

The daemon's `httpServer` in `ws/server.ts` is an `http.Server` that currently only handles WebSocket upgrades. Add a standard HTTP request listener for API routes before forwarding upgrades:

```typescript
// In ws/server.ts — add route handler before upgrade
httpServer.on('request', (req, res) => {
  if (req.method === 'POST' && req.url === '/api/sessions') {
    handleLaunchSession(req, res)   // spawns child_process
    return
  }
  res.writeHead(404)
  res.end()
})
```

The `handleLaunchSession` handler reads `{ provider, workspacePath }` from the request body, spawns the claude/codex process via `child_process.spawn`, and returns `{ sessionId }`. The daemon's hook server will receive the `SessionStart` hook and emit the event normally.

**CRITICAL for SESS-02:** Claude Code cannot be launched as a Node.js child process in all environments (see GitHub issue #771 on anthropics/claude-code). The safest approach for v1 is:
- The daemon receives the `workspacePath` and `provider`
- For Claude: emit a `session_start` event and return instructions for the user to start the session manually with the hooks configured (or use `open` to launch a terminal)
- For Codex: spawn the codex process via `child_process.spawn` (not blocked by the same issue)
- The session attach flow (SESS-03) works regardless because it only requires the user to start the agent with hooks pointing to the daemon

### Anti-Patterns to Avoid
- **Storing raw events in the store:** Do not keep an array of all events in the UI store. Derive session state from events as they arrive. The raw event log lives in SQLite; replaying all events at connect time is already handled by the daemon's catch-up protocol.
- **One WebSocket per component:** Open exactly one WebSocket per app instance. Manage it outside React with the vanilla Zustand API.
- **Routing panel state via URL only:** The selected panel should be in the URL (for shareability) but panel content state (scroll position, expanded items) should be in Zustand keyed by sessionId, so switching sessions preserves per-session panel state (OPS-03).
- **Inline session discovery API:** Do not add a separate REST endpoint to "get all sessions" — sessions are fully derivable from the events already streaming over WebSocket. The catch-up replay on reconnect sends all historical events.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accessible tabs | Custom div-based tabs | shadcn Tabs (Radix UI) | Focus management, ARIA roles, keyboard nav all handled |
| Status badge rendering | Custom span + switch | shadcn Badge with variant | Consistent sizing, color system, semantic |
| Form validation for launch modal | Manual string checks | shadcn/react-hook-form or simple controlled inputs | react-hook-form adds overhead; for a 2-field form, controlled state is fine; shadcn Input/Select handles a11y |
| Scroll area | `overflow-y: auto` on arbitrary divs | shadcn ScrollArea | Cross-platform scrollbar styling, keyboard-accessible |
| WebSocket reconnect with backoff | Custom loop | The `useSessionEvents` hook pattern above | The pattern is 20 lines; no library needed at this scale |
| Classname merging | String concatenation | `cn()` from shadcn (clsx + tailwind-merge) | Handles Tailwind class conflicts correctly |

**Key insight:** The hardest problem in this phase is correctly deriving session state from the event stream, not the UI chrome. Invest in the store's `applyEvent` reducer being correct and testable; the layout components are thin wrappers.

---

## Common Pitfalls

### Pitfall 1: Missing `lastSeenSequence` on reconnect
**What goes wrong:** After a WebSocket disconnect, the UI reconnects with `lastSeenSequence=0`, replaying all events from the beginning. Sessions flash briefly as they are re-derived, and the session list appears to reset.
**Why it happens:** The reconnect logic forgets to read `lastSeenSequence` from the store at reconnect time.
**How to avoid:** Always read `useStore.getState().lastSeenSequence` at the moment of reconnect (not at module initialization). See `connectDaemon()` pattern above.
**Warning signs:** Console shows duplicate session_start events; session status briefly toggles.

### Pitfall 2: React Router `react-router-dom` import
**What goes wrong:** Importing from `react-router-dom` in a React Router v7 project adds the legacy package unnecessarily.
**Why it happens:** All pre-v7 tutorials use `react-router-dom`.
**How to avoid:** Import everything from `"react-router"` in v7. `react-router-dom` is deprecated and re-exports from `react-router`.

### Pitfall 3: Tailwind v4 config mismatch
**What goes wrong:** Running `pnpm dlx shadcn@latest init` generates a `tailwind.config.ts` (v3 style) that conflicts with the v4 `@tailwindcss/vite` plugin setup.
**Why it happens:** shadcn's CLI may lag behind Tailwind v4 changes. Check the CLI output carefully.
**How to avoid:** Use `@import "tailwindcss"` in `index.css` and the `@tailwindcss/vite` plugin; delete any generated `tailwind.config.ts` if present. shadcn components use inline Tailwind classes that work in both v3 and v4.

### Pitfall 4: Vite `packages/ui` not included in root vitest projects
**What goes wrong:** Tests in `packages/ui` are not discovered by root `vitest.config.ts`.
**Why it happens:** The root config uses `projects: ['packages/*']` — this picks up packages that have a vitest config. `packages/ui` needs its own `vitest.config.ts`.
**How to avoid:** Create `packages/ui/vitest.config.ts` with `environment: 'jsdom'` and `setupFiles`. The root config will discover it automatically.

### Pitfall 5: Session state lost on navigation
**What goes wrong:** Navigating between sessions resets per-session panel state (e.g., scroll position in approval inbox).
**Why it happens:** Panel components are unmounted and remounted on session switch; their local `useState` is lost.
**How to avoid:** Store per-session panel state in Zustand (keyed by sessionId), not component-local state. Components read/write to the store on mount/unmount.

### Pitfall 6: NodeNext imports in the `ui` package
**What goes wrong:** Import from `@cockpit/shared` fails in Vite dev server or tests because the workspace package uses NodeNext `exports` requiring `.js` extensions.
**Why it happens:** The existing workspace uses NodeNext moduleResolution. Vite and tsconfig in `packages/ui` need consistent settings.
**How to avoid:** In `packages/ui/tsconfig.json`, extend `../../tsconfig.base.json` (which sets `moduleResolution: NodeNext`) and ensure `packages/ui/vite.config.ts` resolves workspace packages correctly. Vite handles out-of-root workspace symlinks natively.

---

## Code Examples

Verified patterns from official sources:

### Vite config with Tailwind v4 and React
```typescript
// Source: https://tailwindcss.com/docs + https://vite.dev/guide/
// packages/ui/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

### Vitest config for React components
```typescript
// Source: https://vitest.dev/guide/ + https://testing-library.com/
// packages/ui/vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

### setupTests.ts
```typescript
// packages/ui/src/setupTests.ts
import '@testing-library/jest-dom'
```

### Filtered session selector
```typescript
// packages/ui/src/store/selectors.ts
import { useStore } from './index.js'

export function useFilteredSessions() {
  return useStore((state) => {
    const { sessions, filters } = state
    return Object.values(sessions).filter((s) => {
      if (filters.provider && s.provider !== filters.provider) return false
      if (filters.status && s.status !== filters.status) return false
      if (filters.search && !s.workspacePath.toLowerCase().includes(filters.search.toLowerCase())) return false
      return true
    }).sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt))  // recency
  })
}
```

### Empty state panel pattern
```typescript
// packages/ui/src/components/panels/TimelinePanel.tsx
export function TimelinePanel() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-8">
      <span className="text-lg font-medium">Timeline</span>
      <span className="text-sm">Event timeline will appear here in Phase 5.</span>
    </div>
  )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate esbuild + Rollup in Vite | Single Rolldown bundler | Vite 8, March 2026 | 10–30x faster prod builds |
| `@vitejs/plugin-react` using Babel | Uses Oxc in v6 | Plugin-react v6, 2025 | Smaller install, faster HMR |
| Tailwind `tailwind.config.js` + PostCSS | `@tailwindcss/vite` plugin + `@import "tailwindcss"` | Tailwind v4 | No config file needed |
| `import from "react-router-dom"` | `import from "react-router"` | React Router v7 | `react-router-dom` is deprecated |
| Zustand `use-sync-external-store` shim | Removed in v5 (React 18 has it built-in) | Zustand v5, Oct 2024 | Smaller bundle |

**Deprecated/outdated:**
- `react-router-dom`: Deprecated in v7 — all imports from `react-router`
- `tailwind.config.js`: Not needed for Tailwind v4 Vite setup
- `vitest.workspace.ts`: Deprecated — use `vitest.config.ts` with `projects` field (already done in root config)

---

## Open Questions

1. **SESS-02: Claude Code subprocess spawning**
   - What we know: GitHub issue #771 reports Claude Code cannot be spawned from Node.js scripts via `exec`/`spawn`
   - What's unclear: Whether this is resolved in recent Claude Code versions; whether using `open` (macOS) to launch a terminal works as fallback
   - Recommendation: For Phase 3, implement SESS-02 as a "configure and copy" flow: the UI generates the correct hook configuration command and provides a copy-to-clipboard button, rather than spawning the process. Flag for revisit in Phase 4 when Codex adapter is built (Codex spawning is not blocked).

2. **Daemon HTTP server: API routes vs WebSocket upgrade port conflict**
   - What we know: The daemon's `httpServer` (port 3001) already handles WebSocket upgrades via the `upgrade` event; the `request` event is unused
   - What's unclear: Whether adding `request` handler to the same server introduces ordering issues
   - Recommendation: Add the `request` handler before the `upgrade` handler. Node.js HTTP server fires `request` for non-upgrade requests and `upgrade` for WebSocket handshakes; no conflict.

3. **Session workspacePath → project name derivation**
   - What we know: The `session_start` event carries `workspacePath` (e.g., `/Users/fab/Projects/foo`)
   - What's unclear: Whether to use `path.basename(workspacePath)` as the "project" filter value, or add a `projectName` field to SessionStartEvent
   - Recommendation: Use `path.basename(workspacePath)` in the UI for Phase 3; adding a field to the schema is a Phase 4+ concern.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (workspace projects) |
| Config file | `packages/ui/vitest.config.ts` — Wave 0 gap |
| Quick run command | `pnpm --filter @cockpit/ui test --run` |
| Full suite command | `pnpm test --run` (root, runs all packages) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SESS-01 | Session map updated by session_start event | unit | `pnpm --filter @cockpit/ui test --run sessionsSlice` | ❌ Wave 0 |
| SESS-01 | Session removed/ended by session_end event | unit | `pnpm --filter @cockpit/ui test --run sessionsSlice` | ❌ Wave 0 |
| SESS-02 | POST /api/sessions returns sessionId | unit | `pnpm --filter @cockpit/daemon test --run launch-session` | ❌ Wave 0 |
| SESS-03 | WebSocket reconnect uses lastSeenSequence from store | unit | `pnpm --filter @cockpit/ui test --run wsSlice` | ❌ Wave 0 |
| SESS-04 | Filtered session list respects provider/status/search | unit | `pnpm --filter @cockpit/ui test --run SessionFilters` | ❌ Wave 0 |
| OPS-01 | Session list renders all sessions | component | `pnpm --filter @cockpit/ui test --run OpsLayout` | ❌ Wave 0 |
| OPS-02 | Selecting session renders detail panel | component | `pnpm --filter @cockpit/ui test --run OpsLayout` | ❌ Wave 0 |
| OPS-03 | Switching session preserves per-session panel state | unit | `pnpm --filter @cockpit/ui test --run uiSlice` | ❌ Wave 0 |
| OPS-04 | Each panel tab renders without error (empty state) | component | `pnpm --filter @cockpit/ui test --run panels` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @cockpit/ui test --run`
- **Per wave merge:** `pnpm test --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/ui/vitest.config.ts` — jsdom environment, setupFiles
- [ ] `packages/ui/src/setupTests.ts` — @testing-library/jest-dom import
- [ ] `packages/ui/src/__tests__/sessionsSlice.test.ts` — covers SESS-01, SESS-03
- [ ] `packages/ui/src/__tests__/SessionFilters.test.tsx` — covers SESS-04
- [ ] `packages/ui/src/__tests__/OpsLayout.test.tsx` — covers OPS-01, OPS-02, OPS-04
- [ ] `packages/ui/src/__tests__/uiSlice.test.ts` — covers OPS-03
- [ ] `packages/daemon/src/__tests__/launch-session.test.ts` — covers SESS-02 (new daemon endpoint)
- [ ] Framework install: `pnpm --filter @cockpit/ui add -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom`

---

## Sources

### Primary (HIGH confidence)
- Vite official docs + https://vite.dev/blog/announcing-vite8 — Vite 8 with Rolldown, @vitejs/plugin-react v6 with Oxc
- https://ui.shadcn.com/docs/installation/vite — shadcn/ui Vite installation steps, Tailwind v4 setup
- https://tailwindcss.com/docs — Tailwind v4 Vite plugin installation
- https://reactrouter.com/start/modes — React Router v7 modes (Declarative / Data / Framework)
- https://pmnd.rs/blog/announcing-zustand-v5 — Zustand v5 breaking changes (React 18+, TS 4.5+, no new features)
- https://zustand.docs.pmnd.rs/learn/getting-started/introduction — Basic store creation pattern
- Project source: `packages/daemon/src/` — existing WS server, DB schema, event types

### Secondary (MEDIUM confidence)
- https://github.com/pmndrs/zustand/discussions/1651 — WebSocket integration patterns (verified against Zustand docs)
- https://github.com/pmndrs/zustand/discussions/2779 — Zustand as WebSocket middleware
- Multiple search results corroborating React Router v7 "import from react-router" deprecation of react-router-dom

### Tertiary (LOW confidence)
- https://github.com/anthropics/claude-code/issues/771 — Claude Code cannot be spawned from Node.js (single source, GitHub issue, unresolved status unknown)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — official docs verified for Vite 8, Tailwind v4, Zustand v5, React Router v7
- Architecture: HIGH — derives directly from existing daemon code structure and event schema
- Pitfalls: MEDIUM — most verified against official docs; Claude spawn issue is LOW (single GitHub issue)
- Validation architecture: HIGH — follows same patterns as Phases 1–2

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (Tailwind v4 and shadcn evolving; recheck if > 30 days)
