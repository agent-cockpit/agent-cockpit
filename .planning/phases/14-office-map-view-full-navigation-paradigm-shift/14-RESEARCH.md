# Phase 14: Office Map View — Full Navigation Paradigm Shift - Research

**Researched:** 2026-04-10
**Domain:** React Router v7, Zustand, Radix UI, dnd-kit, component-level modal/popup patterns
**Confidence:** HIGH (all findings verified against actual codebase)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Office map IS the app — it is the landing/default view, not a secondary tab
- Top-level nav (Agent Cockpit | History | Office) is simplified or removed entirely
- History is no longer a primary nav destination — accessible as a global popup (map UI button or top bar)
- User has their own controllable character on the map (static or minimal animation — no physics/movement engine)
- Each active agent session has its own character on the map
- Auto-layout for character positions (no persisted positions across restarts)
- Sidebar retained but minimal: shows only active instance list with name + status badge
- Clicking an instance in sidebar focuses/teleports camera to that instance's character on the map
- Popup hub triggered by clicking an agent character on the map, containing all session detail as tabs: Approvals, Timeline, Diff, Memory, Artifacts
- This is the new "session detail view" — replaces the old per-session tab pages
- History accessible as a global popup (e.g., map UI button or top bar element)
- approve/deny/always-allow functionality must remain fully operational within the popup hub

### Claude's Discretion
- Specific popup framework (modal, drawer, floating panel)
- Camera focus animation (snap vs. smooth)
- Map tile/background visual style (reuse existing space station assets if available)
- Popup sizing and layout within constraints
- Exact top bar simplification approach
- Character sprite selection (use existing AgentSprite components)

### Deferred Ideas (OUT OF SCOPE)
- Actual character movement animation or physics
- Persisted map positions across restarts (auto-layout is fine)
- Real-time multiplayer or collaboration features
- Redesign of popup content internals (Approvals, Timeline, etc. keep current logic/UI)
</user_constraints>

---

## Summary

Phase 14 transforms the app from an "Ops dashboard with optional Office view" into an "Office map that IS the dashboard." The migration is primarily a **routing and layout restructure** — the underlying panel components (ApprovalInbox, TimelinePanel, DiffPanel, MemoryPanel, ArtifactsPanel, HistoryPage) do not change internally, they simply move from React Router routed pages into a popup container rendered on top of the Office canvas.

The current codebase has all necessary building blocks. The router places OfficePage at `/office` as a child of OpsLayout; this needs to flip so OfficePage (renamed to something like `MapPage` or kept as `OfficePage`) IS the root layout. Session detail panels currently get `sessionId` via `useParams()` from the URL — this is the key coupling to break. The popup hub must supply `sessionId` via React context or props without routing.

The main technical risk is the **`useParams` coupling** in ApprovalInbox, TimelinePanel, DiffPanel, and MemoryPanel. Each currently calls `useParams<{ sessionId: string }>()` to get the session ID. In the popup model, there is no URL segment; sessionId must come from component state or a store field. The safest approach is a thin wrapper that reads `selectedSessionId` from the Zustand store and renders the panel — panels keep `useParams` compatibility via a parallel code path, or `useParams` is replaced with a store read in each panel.

**Primary recommendation:** New root layout (`MapLayout`) with OfficePage as the main content area, a slimmed sidebar showing only instance name+status, a `SessionPopupHub` component rendered as a fixed overlay on sprite click, and a `HistoryPopupModal` triggered from a top-bar button. All panels adapt to receive `sessionId` from Zustand `selectedSessionId` instead of URL params.

---

## Current Codebase — Exact State

### Routing (router.tsx)

```
/ (OpsLayout — full sidebar + main area)
├── index: "Select a session" placeholder
├── /history → HistoryPage (lazy)
├── /office → OfficePage (lazy)
└── /session/:sessionId (SessionDetailPanel — tab header + Outlet)
    ├── index → ApprovalInbox
    ├── /approvals → ApprovalInbox
    ├── /timeline → TimelinePanel
    ├── /diff → DiffPanel
    ├── /memory → MemoryPanel
    └── /artifacts → ArtifactsPanel
```

**Default route:** `/` renders the "Select a session" placeholder. OfficePage is at `/office`. History is at `/history`.

### OpsLayout (layout/OpsLayout.tsx)

- Full-width `flex h-screen` with `w-72` left sidebar
- Sidebar header has: app title "Agent Cockpit" + two NavLinks ("History" and "Office")
- Sidebar body: `<SessionListPanel />` — full session list with filters, launch button, session cards
- Main area: `<Outlet />` — renders whatever route is active

### SessionListPanel (layout/SessionListPanel.tsx)

- Shows `useFilteredSessions()` — ALL sessions (active + ended), filtered by provider/status/search
- Renders `<SessionCard>` per session (provider badge, project name, pending approval badge, status dot)
- Has `<SessionFilters>` (filter chips) and `<LaunchSessionModal>`
- On card click: calls `selectSession(sessionId)` then `navigate('/session/' + sessionId + '/approvals')`

### OfficePage (pages/OfficePage.tsx)

- Uses `useActiveSessions()` — only `status === 'active'` sessions
- DndContext wrapping canvas div with `backgroundImage: floor-tileset.png`
- Renders `<AgentSprite>` per session, positioned absolutely on canvas (5-column grid default)
- On sprite click: calls `selectSession(sessionId)` + `navigate('/session/' + sessionId + '/approvals')`
- Canvas positions stored in localStorage: key `cockpit.office.positions`
- `useLocalStorage` hook from `hooks/useLocalStorage.ts`
- CELL = 96px, COLS = 5

### AgentSprite (components/office/AgentSprite.tsx)

- Props: `session, agentState, position, isDragging, onClick, elapsedMs, lastToolUsed, direction`
- Uses `useDraggable` from dnd-kit
- Uses `HoverCard.Root/Trigger/Content` from `@radix-ui/react-hover-card`
- CSS: `position: absolute`, left/top from props, CSS.Transform from dnd-kit drag
- Click handler: passed as `onClick` prop from OfficePage
- Shows `<AgentHoverCard>` on hover

### AgentHoverCard (components/office/AgentHoverCard.tsx)

- Props: `session, lastToolUsed, elapsedMs`
- Shows: provider badge, task title (workspacePath basename), status, repo name, pending approvals count, last tool used, elapsed time

### SessionDetailPanel (layout/SessionDetailPanel.tsx)

- Gets `sessionId` from `useParams()`
- Looks up session from store: `s.sessions[sessionId]`
- Renders header (provider badge, project name, status dot, pending approvals count, started time)
- Renders 5-tab NavLink strip (Approvals | Timeline | Diff | Memory | Artifacts)
- Uses `<Outlet />` for panel content

### Panel Components — sessionId coupling (CRITICAL)

All five panels get their sessionId via `useParams`:

| Panel | useParams call | Other external deps |
|-------|---------------|---------------------|
| ApprovalInbox | `useParams<{ sessionId }>()` | `useStore(s => s.pendingApprovalsBySession[sessionId])`, `sendWsMessage` |
| TimelinePanel | `useParams<{ sessionId }>()` | `useStore(s => s.events[sessionId])`, `bulkApplyEvents`, fetch API |
| DiffPanel | `useParams<{ sessionId }>()` | `useStore(s => s.events[sessionId])`, `useStore(s => s.sessions[sessionId])` |
| MemoryPanel | `useParams<{ sessionId }>()` | `useStore(s => s.sessions[sessionId])`, fetch API (claude-md, notes, suggestions) |
| ArtifactsPanel | none (stub) | none |

### Zustand Store (store/index.ts)

Key slices relevant to this phase:

- `sessions: Record<string, SessionRecord>` — active sessions (keyed by sessionId)
- `selectedSessionId: string | null` — which session is focused
- `activePanel: PanelId` — 'approvals' | 'timeline' | 'diff' | 'memory' | 'artifacts'
- `selectSession(id)` — sets selectedSessionId
- `setActivePanel(panel)` — sets activePanel
- `pendingApprovalsBySession: Record<string, PendingApproval[]>` — live approvals keyed by sessionId
- `events: Record<string, NormalizedEvent[]>` — events keyed by sessionId
- `historySessions, historyMode, compareSelectionIds` — history slice (used by HistoryPage)

### Installed Libraries

| Library | Version | Relevant to Phase 14 |
|---------|---------|---------------------|
| `@radix-ui/react-hover-card` | ^1.1.15 | Already used in AgentSprite — NOT a dialog |
| `@dnd-kit/core` | ^6.3.1 | Already in OfficePage for drag |
| `@dnd-kit/utilities` | ^3.2.2 | CSS.Transform used in AgentSprite |
| `react-router` | ^7.0.0 | RouterProvider + createBrowserRouter |
| `zustand` | ^5.0.11 | subscribeWithSelector middleware |
| `react` | ^18.3.0 | |
| `tailwindcss` | ^4.0.0 | |

**NOT installed:** `@radix-ui/react-dialog`, `@radix-ui/react-tabs` — must be added for popup hub.

### HistoryPage (pages/HistoryPage.tsx)

- Self-contained page component: fetches `/api/sessions`, renders filter bar + session list + ComparePanel
- Uses `useStore()` for: `historySessions`, `bulkApplySessions`, `setHistoryMode`, `compareSelectionIds`, `toggleCompareSelection`
- On session click: calls `setHistoryMode(true)` then `navigate('/session/:id/timeline')`
- **No internal use of `useParams`** — all state is store-driven + local useState
- Can be wrapped in a modal container without internal changes

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@radix-ui/react-dialog` | ^1.x | Popup hub container + History modal | Accessible, portal-based, already in Radix ecosystem used by project |
| `@radix-ui/react-tabs` | ^1.x | Tab strip inside popup hub | Replaces NavLink-based tab strip cleanly without routing |

### Already Installed (no new installs needed for base nav)
| Library | Version | Purpose |
|---------|---------|---------|
| `@radix-ui/react-hover-card` | ^1.1.15 | AgentSprite hover (keep as-is) |
| `@dnd-kit/core` | ^6.3.1 | Map canvas drag |
| `zustand` | ^5.0.11 | `selectedSessionId` + `activePanel` state |

**Installation:**
```bash
cd packages/ui
pnpm add @radix-ui/react-dialog @radix-ui/react-tabs
```

---

## Architecture Patterns

### Recommended Project Structure

New files to create:
```
packages/ui/src/
├── components/
│   ├── layout/
│   │   ├── MapLayout.tsx          # new root layout (replaces OpsLayout as default)
│   │   ├── MapSidebar.tsx         # stripped sidebar: name + status + focus-camera button
│   │   ├── SessionPopupHub.tsx    # floating popup with Radix Dialog + Tabs for session detail
│   │   ├── HistoryPopupModal.tsx  # Radix Dialog wrapper around HistoryPage content
│   │   └── OpsLayout.tsx          # keep for backward compat or remove (decision point)
│   └── office/
│       └── (existing files unchanged)
├── pages/
│   └── OfficePage.tsx             # modified: onClick opens popup instead of navigate()
└── router.tsx                     # reworked: / → MapLayout, /session/* routes optional or kept
```

### Pattern 1: MapLayout as Root

**What:** Replace OpsLayout as the root component at `/`. OfficePage becomes the `<main>` content instead of a nested child route.

**Approach:**
```typescript
// router.tsx — new shape
export const router = createBrowserRouter([
  {
    path: '/',
    Component: MapLayout,   // new root — renders OfficePage + sidebar + popup overlay
  },
  // Optional: keep /session/:sessionId routes alive for deep links from HistoryPage
  // When historyMode=true and user opens a past session, navigate still works
  {
    path: '/session/:sessionId',
    Component: MapLayout,  // same layout, popup auto-opens from URL param
    // OR: remove and rework HistoryPage to open popup directly
  },
])
```

**Simplest approach:** Keep the existing router shape but change the index route at `/` to render OfficePage directly inside OpsLayout (swap index component). Popup state is component-local on OfficePage rather than URL-driven. This requires LESS routing change.

### Pattern 2: Session Popup Hub (component-local state, no URL)

**What:** When user clicks AgentSprite, instead of `navigate()`, open a React Dialog overlay that renders all 5 panels as Radix Tabs.

**Key design:** `selectedSessionId` in Zustand drives what the popup shows. Popup open/closed state lives in OfficePage (or MapLayout) as `useState`.

```typescript
// OfficePage.tsx — popup approach
const [popupOpen, setPopupOpen] = useState(false)

function handleSpriteClick(sessionId: string) {
  useStore.getState().selectSession(sessionId)
  setPopupOpen(true)
}

// In render:
<SessionPopupHub
  open={popupOpen}
  onClose={() => setPopupOpen(false)}
  sessionId={selectedSessionId}
/>
```

### Pattern 3: Panels Without useParams (CRITICAL CHANGE)

All panels currently call `useParams<{ sessionId: string }>()`. In the popup model, there is no URL route for the panel — `useParams` returns `undefined`.

**Solution:** Add a `sessionId` prop to each panel (or a thin wrapper that reads from store).

Option A — Add sessionId prop to each panel (cleanest):
```typescript
// ApprovalInbox.tsx — before
const { sessionId } = useParams<{ sessionId: string }>()

// ApprovalInbox.tsx — after
interface Props { sessionId?: string }
export function ApprovalInbox({ sessionId: propSessionId }: Props) {
  const { sessionId: paramSessionId } = useParams<{ sessionId: string }>()
  const sessionId = propSessionId ?? paramSessionId
```

Option B — Read `selectedSessionId` from store:
```typescript
const sessionId = useStore((s) => s.selectedSessionId) ?? ''
```

Option B is simpler (no prop threading) and works because clicking a sprite already calls `selectSession()`. Adopt Option B for all panels in Phase 14.

**Impact by panel:**
- `ApprovalInbox`: Replace `useParams` with store read. No other changes.
- `TimelinePanel`: Replace `useParams` with store read. No other changes.
- `DiffPanel`: Replace `useParams` with store read. No other changes.
- `MemoryPanel`: Replace `useParams` with store read. No other changes.
- `ArtifactsPanel`: Already a stub, no params used.

### Pattern 4: Sidebar Simplification

**What:** Strip SessionListPanel down to name+status only. Remove SessionFilters, LaunchSessionModal reference (can be moved to top bar), filter logic.

New `MapSidebar`:
```typescript
// Renders only active sessions (useActiveSessions())
// Each row: [status dot] [workspacePath basename]
// On click: scroll/pan map to center on that session's AgentSprite
```

Camera focus (camera = scroll offset of the canvas div): store selected session position and use `scrollTo` or CSS transform to bring it into view. No animation library needed — CSS `scroll-behavior: smooth` or `element.scrollIntoView({ behavior: 'smooth' })`.

### Pattern 5: History as Global Popup

**What:** HistoryPage content wraps in a Radix Dialog. A top-bar button triggers it.

HistoryPage currently uses `navigate('/session/:id/timeline')` when user opens a past session. This works if the `/session/:sessionId` routes still exist. If they are removed, HistoryPage must instead call `selectSession(id)` and open the popup hub in historyMode.

**Safest path:** Keep `/session/:sessionId` routes in the router (for deep linking from history), but also ensure popup hub can be triggered from store state. When HistoryPage opens a session, it can set historyMode + selectedSessionId and open the popup. The popup hub reads historyMode from store and passes it to MemoryPanel (which already handles it).

### Anti-Patterns to Avoid

- **URL-driven popup state:** Don't put popup open/close in the URL. State stays in React/Zustand. URL deep-links to past sessions can remain for HistoryPage compatibility.
- **Removing /session/:sessionId routes prematurely:** These routes feed the historyMode workflow (MemoryPanel's historyMode=true path). Keep them or explicitly migrate HistoryPage to popup model in this phase.
- **Duplicating panel logic:** Panels should not be copy-pasted. The same panel component serves both the old routed view (if retained for history) and the new popup view.
- **Replacing useParams with prop drilling:** Avoid threading sessionId through 3+ component layers. Use Zustand selectedSessionId instead.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accessible modal overlay | Custom div + z-index + focus trap | `@radix-ui/react-dialog` | Focus trap, keyboard dismiss (Escape), aria-modal, portal rendering — 40+ edge cases |
| Tab strip in popup | Custom button array + active state | `@radix-ui/react-tabs` | Keyboard navigation, aria-selected, roving tabindex — already Radix pattern in codebase |
| Camera pan-to-sprite | Custom scroll animation | `element.scrollIntoView({ behavior: 'smooth' })` or `scrollTo` | Native browser API, no deps |
| Drag state in popup | Custom mouse/touch tracking | dnd-kit already installed, don't reimplement | dnd-kit is already wired in OfficePage |

---

## Common Pitfalls

### Pitfall 1: useParams Returns Undefined in Popup
**What goes wrong:** Panels render inside Radix Dialog (no route context) — `useParams()` returns `{}`, sessionId is undefined — panels show empty/error state.
**Why it happens:** `useParams` only works inside a route that has `:sessionId` in its path.
**How to avoid:** Replace `useParams` in each panel with `useStore((s) => s.selectedSessionId)`. Do this first in Wave 0 stubs or early in plan ordering.
**Warning signs:** Panel renders "No session selected" or fetches for `undefined` sessionId.

### Pitfall 2: HistoryPage Opens Routed Session Detail (navigate()) While Popup is Open
**What goes wrong:** Clicking a history session calls `navigate('/session/X/timeline')` which changes URL, unmounts the popup, and renders old SessionDetailPanel — breaking the new layout.
**Why it happens:** HistoryPage was written for the old navigation model.
**How to avoid:** Either (a) keep old routes alive for history sessions only and accept dual navigation models temporarily, or (b) update HistoryPage to call `selectSession(id) + setHistoryMode(true)` and open popup hub via a store flag. Option (a) is lower risk for this phase.

### Pitfall 3: Approval Decision Breaks Without WS Connection Check
**What goes wrong:** `handleDecision` in ApprovalInbox calls `sendWsMessage` — if popup opens while `wsStatus !== 'connected'`, buttons should be disabled. This is already handled (`disabled={!isConnected}`) but the wsStatus check must be preserved.
**How to avoid:** Don't strip the `wsStatus` check when refactoring ApprovalInbox.

### Pitfall 4: `useActiveSessions` vs `useFilteredSessions`
**What goes wrong:** New sidebar using `useActiveSessions` (active only) is correct. But if LaunchSessionModal or other features need all sessions, `useFilteredSessions` must remain wired.
**How to avoid:** Use `useActiveSessions()` for the map sidebar. Keep `useFilteredSessions()` for any session picker elsewhere.

### Pitfall 5: DndContext Must Wrap AgentSprite Uses
**What goes wrong:** AgentSprite uses `useDraggable` which requires a parent `DndContext`. If OfficePage is restructured and DndContext is lost in the refactor, sprites throw.
**How to avoid:** DndContext must remain wrapping the entire canvas area in OfficePage.

### Pitfall 6: Radix Dialog Portal Breaks RTL Tests
**What goes wrong:** Radix Dialog renders children in a portal (document.body). `screen.getByTestId` works, but `within(container)` scoping fails.
**Why it happens:** Same as AgentHoverCard.Content in existing tests — portal escapes the render container.
**How to avoid:** Mock `@radix-ui/react-dialog` in tests (same pattern as existing HoverCard mock). Dialog.Content mock renders children synchronously without portal.

### Pitfall 7: `historyMode` Flag Leaks Into Live Session Popup
**What goes wrong:** `setHistoryMode(true)` is called when opening a history session. If user then clicks a live agent sprite, MemoryPanel shows "Read-only" banner erroneously.
**Why it happens:** `historyMode` is global store state.
**How to avoid:** Call `setHistoryMode(false)` when opening the popup hub for live sessions (on sprite click). Already guarded in MemoryPanel by checking `session?.status`.

---

## Code Examples

### SessionPopupHub (new component skeleton)

```typescript
// Source: verified from @radix-ui/react-dialog docs + @radix-ui/react-tabs docs
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import { useStore } from '../../store/index.js'

const TAB_IDS = ['approvals', 'timeline', 'diff', 'memory', 'artifacts'] as const

export function SessionPopupHub({ open, onClose }: { open: boolean; onClose: () => void }) {
  const selectedSessionId = useStore((s) => s.selectedSessionId)
  const session = useStore((s) => selectedSessionId ? s.sessions[selectedSessionId] : undefined)

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                     w-[80vw] max-w-5xl h-[80vh] bg-background rounded-lg shadow-xl flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
            <span>{session?.provider}</span>
            <span>{session?.workspacePath.split('/').at(-1)}</span>
            <Dialog.Close className="ml-auto" aria-label="Close">✕</Dialog.Close>
          </div>

          {/* Tabs */}
          <Tabs.Root defaultValue="approvals" className="flex flex-col flex-1 overflow-hidden">
            <Tabs.List className="flex border-b shrink-0 px-4">
              {TAB_IDS.map((id) => (
                <Tabs.Trigger key={id} value={id}
                  className="px-3 py-2 text-sm font-medium border-b-2 -mb-px data-[state=active]:border-blue-600">
                  {id.charAt(0).toUpperCase() + id.slice(1)}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <div className="flex-1 overflow-auto">
              <Tabs.Content value="approvals"><ApprovalInbox /></Tabs.Content>
              <Tabs.Content value="timeline"><TimelinePanel /></Tabs.Content>
              <Tabs.Content value="diff"><DiffPanel /></Tabs.Content>
              <Tabs.Content value="memory"><MemoryPanel /></Tabs.Content>
              <Tabs.Content value="artifacts"><ArtifactsPanel /></Tabs.Content>
            </div>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

### Panel useParams → Store Migration Pattern

```typescript
// Before (all 4 panels):
const { sessionId } = useParams<{ sessionId: string }>()

// After — works in both popup and routed context:
const paramSessionId = useParams<{ sessionId: string }>().sessionId
const storeSessionId = useStore((s) => s.selectedSessionId)
const sessionId = paramSessionId ?? storeSessionId ?? ''
```

This preserves backward compatibility with existing `/session/:sessionId` routes (which historyMode depends on) while working in the popup context.

### Sidebar Focus-Camera Pattern

```typescript
// MapSidebar — on instance click
function handleInstanceClick(sessionId: string, position: { x: number; y: number }) {
  canvasRef.current?.scrollTo({
    left: position.x - window.innerWidth / 2,
    top: position.y - window.innerHeight / 2,
    behavior: 'smooth',
  })
}
```

OfficePage must expose current positions (from `useLocalStorage`) to the sidebar. Pass via prop or lift state into a shared context/store field.

---

## Migration Path (Safe Order)

The safest migration avoids breaking approvals at any intermediate step.

**Wave 1 — Panel decoupling (no UI change, pure refactor):**
1. Update ApprovalInbox, TimelinePanel, DiffPanel, MemoryPanel to fall back to `selectedSessionId` from store when `useParams` returns undefined.
2. All existing tests still pass (params still work when routed).

**Wave 2 — New components:**
3. Create `SessionPopupHub` with Radix Dialog + Tabs wrapping all 5 panels.
4. Create `HistoryPopupModal` wrapping HistoryPage content.
5. Create `MapSidebar` (slim sidebar, active sessions only, name+status).
6. Create `MapLayout` (OfficePage as main content + MapSidebar + popup overlay).

**Wave 3 — Router switch:**
7. Change router so `/` renders MapLayout (OfficePage fills main area, no nested /office route).
8. OfficePage `handleSpriteClick`: remove `navigate()` call, add `setPopupOpen(true)`.
9. OpsLayout: simplify top-bar (remove History/Office NavLinks, add History popup trigger button).
10. Keep `/session/:sessionId` routes alive (historyMode deep links).

**Wave 4 — Sidebar wiring:**
11. Wire camera focus from MapSidebar.
12. Add user character placeholder to map.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Radix Dialog not installed | Install `@radix-ui/react-dialog@^1.x` | New dep, aligns with existing Radix pattern |
| Radix Tabs not installed | Install `@radix-ui/react-tabs@^1.x` | New dep, replaces NavLink tabs in popup |
| Session detail via URL route | Session detail via component popup state | useParams fallback needed in panels |
| OpsLayout as root | MapLayout as root | One root layout change |

---

## Open Questions

1. **History popup vs. routed history sessions**
   - What we know: HistoryPage.openSession calls `navigate('/session/:id/timeline')` which loads old SessionDetailPanel via route
   - What's unclear: Should Phase 14 fully migrate HistoryPage to use popup hub, or defer to a follow-up?
   - Recommendation: Defer full history-popup integration. In Phase 14, HistoryPage still calls `navigate()` to the old `/session/:id` routed view. Those routes remain in the router. Popup hub only activates from sprite clicks on the map.

2. **User character on map**
   - What we know: Decision says "static or minimal animation, no physics"
   - What's unclear: What sprite to use? Existing characterMapping.ts has 10 characters
   - Recommendation: Use a distinct "user" sprite slot (or the first character type). Position it at a fixed slot (e.g., bottom-center of canvas). No dnd dragging needed.

3. **`cockpit.office.positions` localStorage — reset or keep?**
   - Decision says "auto-layout, no persisted positions across restarts"
   - Current OfficePage already supports auto-layout fallback (grid default when key missing)
   - Recommendation: Keep the localStorage key but don't break it. Auto-layout (grid) is the default when no stored position exists. Existing stored positions still work.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x + @testing-library/react 16.x |
| Config file | `packages/ui/vitest.config.ts` |
| Quick run command | `cd packages/ui && pnpm test --run` |
| Full suite command | `cd packages/ui && pnpm test --run` |

### Phase Requirements → Test Map

| Behavior | Test Type | Automated Command | Notes |
|----------|-----------|-------------------|-------|
| OfficePage renders as default/root view | unit | `pnpm test --run OfficePage` | Modify existing OfficePage.test.tsx |
| Clicking sprite opens popup hub (not navigate) | unit | `pnpm test --run OfficePage` | Assert `mockNavigate` NOT called; popup visible |
| SessionPopupHub renders correct tabs | unit | `pnpm test --run SessionPopupHub` | New test file needed |
| ApprovalInbox works in popup context (no URL params) | unit | `pnpm test --run ApprovalInbox` | Update mock to not provide sessionId via route |
| Approve/deny/always-allow still calls sendWsMessage | unit | `pnpm test --run ApprovalInbox` | Critical regression check |
| MapSidebar shows only active sessions, name+status | unit | `pnpm test --run MapSidebar` | New test file needed |
| Sidebar click focuses camera (scrollTo called) | unit | `pnpm test --run MapSidebar` | Mock scrollTo |
| HistoryPopupModal opens/closes via button | unit | `pnpm test --run HistoryPopupModal` | New test file |
| Top-bar nav links removed or simplified | unit | `pnpm test --run OpsLayout` | Update OpsLayout.test.tsx |

### Wave 0 Gaps
- [ ] `src/__tests__/SessionPopupHub.test.tsx` — covers popup open/close, tab navigation, sessionId from store
- [ ] `src/__tests__/MapSidebar.test.tsx` — covers active-only list, name+status display, camera focus callback
- [ ] `src/__tests__/HistoryPopupModal.test.tsx` — covers modal open/close, History content visible
- [ ] `@radix-ui/react-dialog` and `@radix-ui/react-tabs` installs required before any new component tests

---

## Sources

### Primary (HIGH confidence)
- Direct codebase read: `packages/ui/src/router.tsx` — exact current route structure
- Direct codebase read: `packages/ui/src/components/layout/OpsLayout.tsx` — exact layout structure
- Direct codebase read: `packages/ui/src/components/layout/SessionListPanel.tsx` — full sidebar contents
- Direct codebase read: `packages/ui/src/pages/OfficePage.tsx` — canvas, dnd, click handler
- Direct codebase read: `packages/ui/src/components/layout/SessionDetailPanel.tsx` — tab strip, Outlet
- Direct codebase read: `packages/ui/src/components/panels/ApprovalInbox.tsx` — useParams usage, sendWsMessage
- Direct codebase read: `packages/ui/src/components/panels/TimelinePanel.tsx` — useParams usage
- Direct codebase read: `packages/ui/src/components/panels/DiffPanel.tsx` — useParams usage
- Direct codebase read: `packages/ui/src/components/panels/MemoryPanel.tsx` — useParams + historyMode
- Direct codebase read: `packages/ui/src/store/index.ts` — full Zustand store shape
- Direct codebase read: `packages/ui/package.json` — installed deps (only `@radix-ui/react-hover-card`, no dialog/tabs)
- Direct codebase read: `packages/ui/src/main.tsx` — `useSessionEvents()` hook at app root

### Secondary (MEDIUM confidence)
- Radix UI Dialog and Tabs are well-established packages (^1.x) consistent with project's existing Radix usage pattern
- `@radix-ui/react-hover-card` already used — same package family, same install pattern

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Current codebase state: HIGH — all files read directly
- Standard stack: HIGH — verified from package.json; Radix Dialog/Tabs are natural extensions
- Architecture patterns: HIGH — derived from actual component signatures and coupling points
- Pitfalls: HIGH — identified from actual `useParams` calls in each panel file
- Migration path: MEDIUM — sequencing is reasoned, execution depends on implementation details

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable codebase, no external API dependencies)
