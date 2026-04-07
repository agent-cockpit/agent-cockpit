# Phase 9: Office Mode - Research

**Researched:** 2026-04-07
**Domain:** Animated UI canvas, CSS sprite animation, drag-and-drop layout, React performance
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OFFICE-01 | User can see each active agent as an animated visual entity whose animation reflects its current state (planning, coding, reading, testing, waiting, blocked, completed, failed) | Event-to-state mapping from existing NormalizedEvent schema; CSS sprite animation with steps() + image-rendering: pixelated; state derived from last event type per session |
| OFFICE-02 | User can hover an agent to see its card showing: provider badge, task title, status, repo/branch, pending approvals count, last tool used, and elapsed time | Radix UI HoverCard primitive (already available via @radix-ui packages); SessionRecord in Zustand store already carries pendingApprovals, provider, workspacePath, startedAt |
| OFFICE-03 | User can click an agent in Office mode to open its detailed Ops view | React Router `useNavigate` to `/session/:sessionId/approvals` — same pattern as SessionListPanel |
| OFFICE-04 | User can drag agents to rearrange their positions and customize the office layout, with layout persisted locally | dnd-kit useDraggable with free-form 2D x/y transforms; positions stored as `Record<sessionId, {x,y}>` in localStorage via custom hook |
</phase_requirements>

---

## Summary

Phase 9 adds an "Office mode" view — a 2D canvas where each live agent session appears as an animated pixel-art entity. The view sits alongside the existing Ops layout: a new `/office` route is added, the `OpsLayout` sidebar gets an "Office" nav link, and the page renders a full-viewport positioned container holding one `AgentSprite` component per active session.

Animation is CSS-only (background-position steps over a sprite sheet, `image-rendering: pixelated`, no Canvas API, no WebGL). This approach runs off the main-thread compositor, avoids React re-renders per frame, and trivially sustains 45fps for 10 sprites. State transitions — planning, coding, reading, testing, waiting, blocked, completed, failed — are derived from each session's most-recent NormalizedEvent type and mapped to a named CSS animation class. The mapping runs inside the Zustand store or a selector; the sprite component only reads a `agentState` string prop and applies a CSS class.

Drag-and-drop uses `@dnd-kit/core` (`useDraggable` hook, free-form transforms) with no sortable list constraint. After drag-end, the x/y delta is committed to a `useLocalStorage`-backed positions map keyed by sessionId. On mount, positions are read back from localStorage, surviving browser refresh. The hover card uses Radix UI `HoverCard` (same component family already used by the project) to show the required fields from `SessionRecord`. Navigation on click mirrors the existing `SessionListPanel` pattern: `useNavigate('/session/:id/approvals')`.

**Primary recommendation:** CSS sprite animation + dnd-kit free-form drag + Radix HoverCard. No new heavyweight libraries. Total new `npm install` surface: `@dnd-kit/core` (~10 kB) and `@dnd-kit/utilities` (helpers). All other primitives already present.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| CSS `steps()` keyframes | (built-in) | Sprite sheet frame cycling | Zero-overhead compositor animation, no JS re-renders per frame; universally recommended for sprite sheets |
| `@dnd-kit/core` | ^6.x | Free-form drag-and-drop with x/y transforms | Modern, lightweight (~10 kB), supports 2D free-form positioning via `useDraggable` transforms, actively maintained (latest release Feb 2026) |
| `@dnd-kit/utilities` | ^3.x | CSS utility helpers for transforms | Paired with core; provides `CSS.Transform.toString()` |
| `@radix-ui/react-hover-card` | ^1.x | Hover card primitive for agent cards | Radix primitives already in use; `HoverCard.Root/Trigger/Content` provides accessible popup with `openDelay`/`closeDelay` |
| Zustand (existing) | ^5.0.11 | Agent state derivation + positions | Already in project; add `officePositions` and derived `agentAnimState` to store |
| React Router (existing) | ^7.0.0 | `/office` route + navigation to Ops | Already in project |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `localStorage` (native) | — | Persist drag positions across refresh | No external dependency; `useLocalStorage` custom hook (10-line wrapper) |
| `performance.now()` / `Date.now()` | — | Elapsed time display in hover card | Already available; compute in render from `session.startedAt` |
| Tailwind CSS (existing) | ^4.0.0 | Layout and hover card styling | Already in project |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS `steps()` sprites | Canvas 2D / PixiJS WebGL | Canvas gives higher sprite counts (1000s) but adds 200 kB+ dependency and requires imperative lifecycle management; overkill for 10 agents |
| CSS `steps()` sprites | React `setInterval` + useState per frame | State updates cause re-renders per frame; CSS compositor path has zero JS cost per frame |
| `@dnd-kit/core` | `react-draggable` | `react-draggable` simpler but unmaintained since 2022; dnd-kit actively maintained Feb 2026 |
| `@dnd-kit/core` | HTML5 native drag | Native drag has poor position control, no smooth transforms, poor mobile support |
| Radix `HoverCard` | Tooltip | Tooltip has no `openDelay` on hover, designed for labels not rich content |
| Custom `useLocalStorage` | `use-local-storage-state` npm package | Not worth a dependency for a 10-line hook; JSON.stringify/parse of `Record<string, {x,y}>` is trivial |

**Installation:**
```bash
pnpm --filter @cockpit/ui add @dnd-kit/core @dnd-kit/utilities
```
(Radix HoverCard may already be transitively installed via shadcn; verify before adding separately.)

---

## Architecture Patterns

### Recommended Project Structure

```
packages/ui/src/
├── pages/
│   └── OfficePage.tsx          # new — full-viewport positioned container
├── components/
│   └── office/
│       ├── AgentSprite.tsx      # sprite + hover card trigger
│       ├── AgentHoverCard.tsx   # Radix HoverCard content
│       └── spriteStates.ts      # event → agentState mapping constants
├── store/
│   └── officeSlice.ts           # officePositions + agentAnimState selector
└── hooks/
    └── useLocalStorage.ts       # generic key/value localStorage hook
```

Layout additions:
```
OpsLayout.tsx                    # add "Office" NavLink alongside "History"
router.tsx                       # add /office lazy route → OfficePage
```

### Pattern 1: Event-to-AgentState Mapping

**What:** Derive a named animation state (`planning | coding | reading | testing | waiting | blocked | completed | failed`) from the most-recent NormalizedEvent for a session.

**When to use:** In a selector or computed field; run once per incoming event, not per render frame.

**Mapping logic (HIGH confidence — derived from schema):**

```typescript
// packages/ui/src/components/office/spriteStates.ts
export type AgentAnimState =
  | 'planning' | 'coding' | 'reading' | 'testing'
  | 'waiting'  | 'blocked' | 'completed' | 'failed'

export function deriveAgentState(
  session: SessionRecord,
  lastEvent: NormalizedEvent | undefined,
): AgentAnimState {
  if (session.status === 'ended') {
    // exitCode available via session_end event — treat ended + no error as completed
    return 'completed'
  }
  if (session.pendingApprovals > 0) return 'blocked'
  if (!lastEvent) return 'waiting'

  switch (lastEvent.type) {
    case 'tool_call': {
      const tool = (lastEvent as ToolCallEvent).toolName.toLowerCase()
      if (tool.includes('read') || tool.includes('view') || tool.includes('grep') || tool.includes('search')) return 'reading'
      if (tool.includes('write') || tool.includes('edit') || tool.includes('create') || tool.includes('apply')) return 'coding'
      if (tool.includes('test') || tool.includes('run') || tool.includes('exec') || tool.includes('bash')) return 'testing'
      return 'coding'  // default tool action → coding
    }
    case 'session_start':   return 'planning'
    case 'memory_read':     return 'reading'
    case 'memory_write':    return 'planning'
    case 'subagent_spawn':  return 'planning'
    case 'subagent_complete': return 'waiting'
    case 'approval_request': return 'blocked'
    case 'file_change':     return 'coding'
    case 'session_end':     return 'completed'
    case 'provider_parse_error': return 'failed'
    default:                return 'waiting'
  }
}
```

**Note on timing:** The requirement says "within one second of a matching event arriving." The existing Zustand `applyEvent` action processes WebSocket events synchronously — the derived state update will appear in the next React render cycle (< 16 ms), well within 1 second.

### Pattern 2: CSS Sprite Sheet Animation

**What:** Each `AgentAnimState` maps to a CSS class that selects a row on a sprite sheet image and uses `animation: steps(N)` to cycle frames.

**When to use:** Applied to the sprite `div` as a single className change; no JS per-frame work.

```css
/* Sprite sheet layout: 8 rows (one per state), N frames wide */
/* image-rendering: pixelated preserves crisp pixels at any scale */
.agent-sprite {
  width: 32px;
  height: 32px;
  image-rendering: pixelated;
  background-image: url('/sprites/agent-sheet.png');
  background-repeat: no-repeat;
}

/* Each state selects its row (background-position-y) and animates columns */
.sprite-planning  { background-position-y: 0px;    animation: sprite-walk 0.6s steps(4) infinite; }
.sprite-coding    { background-position-y: -32px;  animation: sprite-code 0.4s steps(4) infinite; }
.sprite-reading   { background-position-y: -64px;  animation: sprite-read 0.8s steps(3) infinite; }
.sprite-testing   { background-position-y: -96px;  animation: sprite-test 0.5s steps(4) infinite; }
.sprite-waiting   { background-position-y: -128px; animation: sprite-idle 1.2s steps(2) infinite; }
.sprite-blocked   { background-position-y: -160px; animation: sprite-blok 0.3s steps(2) infinite; }
.sprite-completed { background-position-y: -192px; animation: none; background-position-x: 0; }
.sprite-failed    { background-position-y: -224px; animation: sprite-fail 0.3s steps(2) infinite; }

@keyframes sprite-walk { from { background-position-x: 0 }    to { background-position-x: -128px } }
@keyframes sprite-code { from { background-position-x: 0 }    to { background-position-x: -128px } }
/* etc. */
```

**Sprite asset strategy:** The project can use a programmatically generated placeholder sprite sheet at design-time (8×N grid of solid-color blocks with distinct hues per state) and replace with final pixel art in a later cosmetic pass (SKIN-01 in v2 requirements). This unblocks implementation without requiring a pixel artist.

**Source:** CSS sprite animation technique verified against [CSS sprite sheets — leanrada.com](https://leanrada.com/notes/css-sprite-sheets/), [kirupa.com sprite sheets](https://www.kirupa.com/html5/sprite_sheet_animations_using_only_css.htm), [LogRocket sprite animation guide](https://blog.logrocket.com/making-css-animations-using-a-sprite-sheet/)

### Pattern 3: Free-Form Drag with dnd-kit

**What:** Each `AgentSprite` is wrapped with `useDraggable`. Position is tracked as `{ x: number, y: number }` per sessionId in a localStorage-backed map.

**When to use:** `DndContext` wraps `OfficePage`. On `onDragEnd`, commit the final position delta to the positions map.

```tsx
// Source: dnd-kit documentation — useDraggable + free-form transform
import { DndContext, DragEndEvent } from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

function DraggableSprite({ sessionId, position, onDragEnd }: Props) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: sessionId })

  // During drag: apply live transform on top of persisted position
  const style: React.CSSProperties = {
    position: 'absolute',
    left: position.x,
    top: position.y,
    transform: CSS.Transform.toString(transform),  // null when not dragging
    cursor: transform ? 'grabbing' : 'grab',
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {/* AgentSprite content */}
    </div>
  )
}

// In OfficePage:
function handleDragEnd(event: DragEndEvent) {
  const { active, delta } = event
  setPositions(prev => ({
    ...prev,
    [active.id as string]: {
      x: (prev[active.id as string]?.x ?? DEFAULT_X) + delta.x,
      y: (prev[active.id as string]?.y ?? DEFAULT_Y) + delta.y,
    },
  }))
}
```

**Default positions:** On first mount, new sessions auto-place in a grid (row × col × cell_size) before the user has dragged anything.

### Pattern 4: localStorage Position Persistence

**What:** A `useLocalStorage` hook reads/writes `Record<sessionId, {x,y}>` to `localStorage` under key `cockpit.office.positions`.

```typescript
// packages/ui/src/hooks/useLocalStorage.ts
export function useLocalStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const setAndPersist = useCallback((updater: T | ((prev: T) => T)) => {
    setValue(prev => {
      const next = typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater
      try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* quota exceeded */ }
      return next
    })
  }, [key])

  return [value, setAndPersist] as const
}
```

**Important:** Debounce or batch localStorage writes are not needed here — positions only change on `dragEnd` (discrete user interaction), not on every event tick.

### Pattern 5: Hover Card Content

**What:** Radix `HoverCard` wraps each `AgentSprite`. The trigger is the sprite `div`; the content is `AgentHoverCard`.

```tsx
// Source: Radix UI HoverCard docs + shadcn pattern
import * as HoverCard from '@radix-ui/react-hover-card'

<HoverCard.Root openDelay={300} closeDelay={100}>
  <HoverCard.Trigger asChild>
    <div /* sprite element */> ... </div>
  </HoverCard.Trigger>
  <HoverCard.Content side="top" align="center" sideOffset={8}>
    <AgentHoverCard session={session} lastEvent={lastEvent} elapsedMs={elapsedMs} />
  </HoverCard.Content>
</HoverCard.Root>
```

**Required hover card fields (from OFFICE-02):**
- Provider badge: `session.provider` → colored badge (`claude` | `codex`)
- Task title: not in current `SessionRecord` — see **Open Questions** #1
- Status: `session.status` + `agentAnimState`
- Repo/branch: derived from `session.workspacePath` (basename = repo name; branch from git not available — see Open Questions #2)
- Pending approvals: `session.pendingApprovals`
- Last tool used: `lastEvent.toolName` if `lastEvent.type === 'tool_call'`
- Elapsed time: `Date.now() - Date.parse(session.startedAt)` formatted as `Xm Ys`

### Pattern 6: Office Mode Navigation Integration

**What:** Add Office mode as a peer route to Ops mode in the existing `OpsLayout`, linked from the top nav bar.

**Route addition to `router.tsx`:**
```tsx
{
  path: 'office',
  lazy: () => import('./pages/OfficePage.js').then(m => ({ Component: m.OfficePage })),
}
```

**NavLink addition in `OpsLayout.tsx`:**
```tsx
<NavLink to="/office" className={...}>Office</NavLink>
```

**Click-through to Ops (OFFICE-03):** Same pattern as `SessionListPanel.handleCardClick`:
```tsx
function handleSpriteClick(sessionId: string) {
  useStore.getState().selectSession(sessionId)
  navigate('/session/' + sessionId + '/approvals')
}
```

### Anti-Patterns to Avoid

- **React state per animation frame:** Never use `useState` or `setInterval`+`setState` to advance sprite frames. CSS `steps()` runs on the compositor thread with zero JS overhead.
- **Canvas for 10 sprites:** Canvas/WebGL is appropriate for 1000+ sprites. For 10, the setup cost (imperative lifecycle, texture management, React reconciliation bridge) is unjustified.
- **Storing full SessionRecord in localStorage:** Store only `{x, y}` per sessionId. Session data lives in Zustand and is refreshed from the WebSocket.
- **Re-reading localStorage on every render:** Initialize once with `useState(() => JSON.parse(...))` lazy initializer; only write on dragEnd.
- **Polling elapsed time with setInterval per sprite:** Use a single shared interval (or `requestAnimationFrame`) at the OfficePage level that updates a single `tick` ref; hover cards recompute elapsed from `startedAt` only while open.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag with position tracking | Custom `mousedown`/`mousemove`/`mouseup` listeners | `@dnd-kit/core useDraggable` | Multi-input (touch, keyboard, pointer), scroll offset correction, portal-aware, accessibility attributes |
| Hover popup | CSS `:hover` + absolute div | Radix `HoverCard` | Handles z-index stacking, viewport overflow flip, focus/blur dismissal, animation lifecycle |
| Sprite state timing | Custom debounce/throttle on animation class changes | Direct className swap — CSS transition handles visual smoothing | One event = one state = one CSS class; no debounce needed |
| LocalStorage sync across tabs | BroadcastChannel or storage event handler | Not needed — office layout is inherently local/single-tab | Adds complexity with no user benefit |

---

## Common Pitfalls

### Pitfall 1: Drag position accumulation error

**What goes wrong:** On each dragEnd, developer adds `delta.x` to the transform (current CSS transform) instead of to the persisted base position. Result: position resets to origin on the next drag start because dnd-kit resets `transform` to null.

**Why it happens:** `useDraggable.transform` is the live drag delta relative to where drag started, not an absolute position. The persisted position must be maintained separately.

**How to avoid:** Store absolute `{x, y}` in the positions map. In render: `left = positions[id].x`, `transform = CSS.Transform.toString(liveDelta)`. On dragEnd: `positions[id] = {x: positions[id].x + delta.x, y: positions[id].y + delta.y}`.

**Warning signs:** Sprites snap back to a corner after each drop.

### Pitfall 2: Sprite leaves viewport when new session appears

**What goes wrong:** New sessions that have never been dragged have no entry in the positions map. If default position is `{x:0, y:0}` all new sprites stack in the top-left corner.

**How to avoid:** On first render of a sessionId not in positions, auto-assign a grid position: `{ x: (index % cols) * cellSize, y: Math.floor(index / cols) * cellSize }`. Write this to the positions map immediately so subsequent renders use the stored value.

**Warning signs:** All new agents pile up at top-left.

### Pitfall 3: HoverCard open during drag

**What goes wrong:** While dragging a sprite, the hover card triggers and obscures the viewport.

**How to avoid:** Pass `open={false}` to `HoverCard.Root` when a drag is in progress. Track drag state via `onDragStart`/`onDragEnd` in `DndContext`.

**Warning signs:** Card flashes or stays visible during drag.

### Pitfall 4: image-rendering not applied correctly

**What goes wrong:** Sprite sheet looks blurry when scaled because the browser applies bilinear interpolation.

**Why it happens:** `image-rendering: pixelated` must be on the element with the `background-image`, not a parent. Some browsers need both `pixelated` (Chrome/Safari) and `crisp-edges` (Firefox).

**How to avoid:**
```css
.agent-sprite {
  image-rendering: pixelated;
  image-rendering: crisp-edges; /* Firefox */
}
```

**Warning signs:** Sprites look blurry/anti-aliased at any size.

### Pitfall 5: AgentState not updating within 1 second

**What goes wrong:** The `deriveAgentState` selector reads stale events because the selector is not subscribed to the events slice.

**Why it happens:** `agentState` is derived from the latest event in `store.events[sessionId]`, which is updated by `applyEventToEvents`. The selector must subscribe to both `sessions` and `events`.

**How to avoid:** Compute `agentAnimState` inside a `useStore` selector that accesses both `state.sessions[sessionId]` and `state.events[sessionId]` (last element). Alternatively, maintain `lastEventType` directly in `SessionRecord` by extending `applyEventToSessions`.

**Warning signs:** Animation state stays at `waiting` even after tool calls arrive.

### Pitfall 6: dnd-kit `useDraggable` and React portals

**What goes wrong:** If the `DragOverlay` or the sprite container is rendered inside a CSS `transform` parent (e.g., a panel with `translate`), the drag coordinates are offset.

**How to avoid:** `OfficePage` must be a direct child of the app root with no CSS transform ancestors. Verify `OpsLayout` uses `flex`/`grid` layout (not `transform`). The current `OpsLayout` uses `flex h-screen` — safe.

---

## Code Examples

### AgentSprite component skeleton

```tsx
// packages/ui/src/components/office/AgentSprite.tsx
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import * as HoverCard from '@radix-ui/react-hover-card'
import type { SessionRecord } from '../../store/index.js'
import type { AgentAnimState } from './spriteStates.js'

interface Props {
  session: SessionRecord
  agentState: AgentAnimState
  position: { x: number; y: number }
  isDragging: boolean
  onClick: () => void
}

export function AgentSprite({ session, agentState, position, isDragging, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: session.sessionId })

  const style: React.CSSProperties = {
    position: 'absolute',
    left: position.x,
    top: position.y,
    transform: CSS.Transform.toString(transform) ?? undefined,
    cursor: transform ? 'grabbing' : 'pointer',
    touchAction: 'none',
  }

  return (
    <HoverCard.Root openDelay={300} closeDelay={100} open={isDragging ? false : undefined}>
      <HoverCard.Trigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          onClick={onClick}
          {...listeners}
          {...attributes}
        >
          <div className={`agent-sprite sprite-${agentState}`} />
          <span className="agent-label">{session.workspacePath.split('/').pop()}</span>
        </div>
      </HoverCard.Trigger>
      <HoverCard.Content side="top" sideOffset={8}>
        {/* AgentHoverCard fields */}
      </HoverCard.Content>
    </HoverCard.Root>
  )
}
```

### OfficePage structure

```tsx
// packages/ui/src/pages/OfficePage.tsx
import { DndContext, DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { useState } from 'react'
import { useStore } from '../store/index.js'
import { useLocalStorage } from '../hooks/useLocalStorage.js'
import { deriveAgentState } from '../components/office/spriteStates.js'
import { AgentSprite } from '../components/office/AgentSprite.js'

const CELL = 96 // default grid cell size px
const COLS = 5

export function OfficePage() {
  const sessions = useStore(s => Object.values(s.sessions).filter(s => s.status === 'active'))
  const events = useStore(s => s.events)
  const [positions, setPositions] = useLocalStorage<Record<string, {x: number; y: number}>>(
    'cockpit.office.positions', {}
  )
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const navigate = useNavigate()

  function getPosition(sessionId: string, index: number) {
    return positions[sessionId] ?? {
      x: (index % COLS) * CELL,
      y: Math.floor(index / COLS) * CELL,
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, delta } = event
    const id = active.id as string
    const base = positions[id] ?? { x: 0, y: 0 }
    setPositions(prev => ({ ...prev, [id]: { x: base.x + delta.x, y: base.y + delta.y } }))
    setActiveDragId(null)
  }

  return (
    <DndContext onDragStart={e => setActiveDragId(e.active.id as string)} onDragEnd={handleDragEnd}>
      <div className="relative w-full h-full overflow-hidden bg-background" data-testid="office-canvas">
        {sessions.map((session, i) => {
          const sessionEvents = events[session.sessionId] ?? []
          const lastEvent = sessionEvents.at(-1)
          const agentState = deriveAgentState(session, lastEvent)
          return (
            <AgentSprite
              key={session.sessionId}
              session={session}
              agentState={agentState}
              position={getPosition(session.sessionId, i)}
              isDragging={activeDragId === session.sessionId}
              onClick={() => {
                useStore.getState().selectSession(session.sessionId)
                navigate('/session/' + session.sessionId + '/approvals')
              }}
            />
          )
        })}
      </div>
    </DndContext>
  )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Canvas API for sprite animation | CSS `steps()` + `image-rendering: pixelated` | ~2018 (CSS steps support) | CSS runs off main thread; no JS per frame |
| `react-dnd` (backend-required) | `@dnd-kit/core` (no backend abstraction) | ~2021; dnd-kit last released Feb 2026 | Simpler API, smaller bundle, active maintenance |
| Inline `position: fixed` manual mousedown | dnd-kit `useDraggable` hook | ~2021 | Handles touch, keyboard, scroll containers automatically |
| Custom tooltip divs | Radix UI `HoverCard` | ~2022 | Accessible, viewport-aware, zero z-index bugs |

**Deprecated/outdated:**
- `react-beautiful-dnd`: Archived/read-only since 2023. Do not use.
- `react-dnd`: Unmaintained since ~2022. Do not use.
- Canvas sprite animation for < 50 sprite applications: CSS compositor approach is strictly better in this count range.

---

## Open Questions

1. **Task title in hover card (OFFICE-02)**
   - What we know: `SessionRecord` does not have a `task` or `title` field. The OFFICE-02 requirement says the hover card shows "task title."
   - What's unclear: Where does task title come from? The `session_start` event has `workspacePath` and `provider` but no task description. It may need to come from the first `tool_call` input or a synthetic "task description" field added to `session_start`.
   - Recommendation: The planner should decide: (a) use `workspacePath.split('/').pop()` as a proxy for task title (simplest, zero schema change), or (b) add an optional `taskTitle` field to `SessionStartEvent` and populate it from the Claude/Codex adapter if available. Option (a) ships immediately; option (b) requires daemon changes outside Phase 9 scope.

2. **Repo/branch in hover card (OFFICE-02)**
   - What we know: `session.workspacePath` gives the repo directory. Branch is not in `SessionRecord`.
   - What's unclear: Is the branch name available from any existing event or daemon endpoint?
   - Recommendation: Display `workspacePath.split('/').pop()` for repo name and omit branch (or show "-") for v1. Branch could be added via a `GET /api/sessions/:id/git-info` endpoint in a future phase. This matches the precedent: `SessionRecord` already omits branch in the existing `SessionDetailPanel`.

3. **Sprite sheet asset**
   - What we know: No pixel art sprite sheet exists in the project. CSS animation requires a real image file.
   - What's unclear: Should the planner commission art or use a programmatic placeholder?
   - Recommendation: Wave 0 of the plan should generate a placeholder sprite sheet (8-row × 4-frame CSS gradient blocks, one per state, created as a simple SVG or CSS-only fallback) sufficient for testing. Final art is a SKIN-01 (v2) concern.

4. **`@radix-ui/react-hover-card` installation status**
   - What we know: The project uses shadcn-style Radix components but `package.json` does not list `@radix-ui/react-hover-card` explicitly.
   - Recommendation: Run `pnpm --filter @cockpit/ui add @radix-ui/react-hover-card` as part of Wave 0 setup. If it's already a transitive dependency, the install is a no-op.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x + React Testing Library 16.x |
| Config file | `packages/ui/vitest.config.ts` (jsdom environment, globals: true) |
| Quick run command | `pnpm --filter @cockpit/ui test --run OfficePage` |
| Full suite command | `pnpm --filter @cockpit/ui test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OFFICE-01 | `deriveAgentState` returns correct state for each event type | unit | `pnpm --filter @cockpit/ui test --run spriteStates` | ❌ Wave 0 |
| OFFICE-01 | `AgentSprite` applies correct CSS class for each `agentAnimState` prop | unit | `pnpm --filter @cockpit/ui test --run AgentSprite` | ❌ Wave 0 |
| OFFICE-01 | Animation state updates within 1 event render cycle | unit | included in AgentSprite test | ❌ Wave 0 |
| OFFICE-02 | `AgentHoverCard` renders all required fields when session provided | unit | `pnpm --filter @cockpit/ui test --run AgentHoverCard` | ❌ Wave 0 |
| OFFICE-03 | Clicking sprite calls `navigate('/session/:id/approvals')` | unit | included in OfficePage test | ❌ Wave 0 |
| OFFICE-04 | `useLocalStorage` initializes from stored JSON, updates on set | unit | `pnpm --filter @cockpit/ui test --run useLocalStorage` | ❌ Wave 0 |
| OFFICE-04 | Positions update after drag-end delta applied | unit | `pnpm --filter @cockpit/ui test --run OfficePage` | ❌ Wave 0 |
| OFFICE-04 | Positions survive re-mount (localStorage read on init) | unit | included in OfficePage test | ❌ Wave 0 |
| Performance (45fps / 10 sessions) | Sustained 45fps with 10 sessions at 10 events/s | manual | Browser DevTools Performance tab — not automatable in jsdom | manual-only |

**Performance test justification for manual-only:** jsdom does not execute CSS animations or run a real browser compositor. The 45fps requirement must be verified in a real browser (Chrome DevTools > Performance > Record). CSS `steps()` animation is off-main-thread and will trivially pass for 10 sprites; the concern is Zustand state updates at 100 events/s total (10 sessions × 10 events/s) causing excess re-renders. Mitigation: `AgentSprite` uses `React.memo` with a custom comparator that only re-renders when `agentState` or `position` changes.

### Sampling Rate
- **Per task commit:** `pnpm --filter @cockpit/ui test --run spriteStates`
- **Per wave merge:** `pnpm --filter @cockpit/ui test --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/ui/src/__tests__/spriteStates.test.ts` — unit tests for `deriveAgentState`, covers OFFICE-01
- [ ] `packages/ui/src/__tests__/AgentSprite.test.tsx` — renders sprite with correct class, hover card fields, click navigation
- [ ] `packages/ui/src/__tests__/AgentHoverCard.test.tsx` — renders all 7 required OFFICE-02 fields
- [ ] `packages/ui/src/__tests__/OfficePage.test.tsx` — drag delta applied to positions, localStorage read on mount
- [ ] `packages/ui/src/__tests__/useLocalStorage.test.ts` — init from storage, write on set, SSR-safe empty-storage fallback
- [ ] `packages/ui/src/sprites/agent-sheet.png` (or `.svg`) — placeholder sprite sheet required for CSS background-image tests to not 404
- [ ] `pnpm --filter @cockpit/ui add @dnd-kit/core @dnd-kit/utilities` — Wave 0 install step
- [ ] Verify `@radix-ui/react-hover-card` available: `pnpm --filter @cockpit/ui add @radix-ui/react-hover-card`

---

## Sources

### Primary (HIGH confidence)

- [CSS sprite sheets — leanrada.com](https://leanrada.com/notes/css-sprite-sheets/) — steps() technique, background-position animation
- [Kirupa.com CSS sprite sheet animations](https://www.kirupa.com/html5/sprite_sheet_animations_using_only_css.htm) — steps()/jump-none technique
- [LogRocket CSS sprite animation guide](https://blog.logrocket.com/making-css-animations-using-a-sprite-sheet/) — React integration patterns
- [MDN CSS and JavaScript animation performance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance) — CSS compositor thread advantage
- [Radix UI HoverCard primitives](https://www.radix-ui.com/primitives/docs/components/hover-card) — HoverCard API, openDelay/closeDelay
- [dnd-kit GitHub](https://github.com/clauderic/dnd-kit) — current version (Feb 2026 release), 2D free-form support confirmed
- Project source files: `packages/shared/src/events.ts`, `packages/ui/src/store/index.ts`, `packages/ui/src/store/sessionsSlice.ts`, `packages/ui/src/components/layout/OpsLayout.tsx`, `packages/ui/src/router.tsx`

### Secondary (MEDIUM confidence)

- [Animating Sprites with CSS and React — alechorner.com](https://alechorner.com/blog/animating-pixel-sprites-with-css) — React+CSS performance tradeoff (CSS ~0 re-render cost; React state ~0.1ms per frame but avoidable)
- [Top 5 Drag-and-Drop Libraries for React 2026 — Puck](https://puckeditor.com/blog/top-5-drag-and-drop-libraries-for-react) — dnd-kit recommended, react-beautiful-dnd archived
- [Josh W. Comeau: Persisting React State in localStorage](https://www.joshwcomeau.com/react/persisting-react-state-in-localstorage/) — useState lazy init + JSON pattern
- [usehooks-ts useLocalStorage](https://usehooks-ts.com/react-hook/use-local-storage) — production-quality hook reference

### Tertiary (LOW confidence)

- None — all critical claims verified against primary or secondary sources.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — dnd-kit current (Feb 2026), Radix already in project, CSS steps technique well-established
- Architecture: HIGH — derived from existing project conventions (SessionListPanel navigation, Zustand store shape, OpsLayout pattern)
- Pitfalls: HIGH — drag position accumulation and image-rendering pitfalls well-documented; others derived from codebase analysis
- Open questions: MEDIUM — task title and branch fields are genuine gaps requiring planner decisions; not blockers

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (dnd-kit stable API; CSS techniques timeless; Radix primitives stable)
