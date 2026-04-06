# Phase 5: Timeline & Replay - Research

**Researched:** 2026-04-06
**Domain:** React event timeline UI, Zustand events slice, daemon REST endpoint for session events, inline detail panel
**Confidence:** HIGH

---

## Summary

Phase 5 adds a fully functional timeline panel to the existing `TimelinePanel.tsx` stub. The panel must display all `NormalizedEvent` objects for the selected session in chronological order (by `sequenceNumber`), support filtering by event type, provide jump-to controls for approval and file-change events, and open inline detail views when an event is clicked.

The critical insight is that the Zustand store currently accumulates only `SessionRecord` summaries — it discards all individual events after applying them to the sessions map. To render a timeline, the store needs a second slice: `events: Record<sessionId, NormalizedEvent[]>`. Every event received via WebSocket must also be appended to this map. This is a pure additive change: the existing `sessionsSlice.ts` remains unchanged; only the store index and the new slice grow.

The daemon already exposes all events over WebSocket. However, the WebSocket sends all events for all sessions globally. For the initial page load (or when switching sessions), the UI needs to recover the full ordered history for one session. The existing `GET`-less HTTP server in `ws/server.ts` needs a new `GET /api/sessions/:sessionId/events` endpoint backed by a new `getEventsBySession` SQLite query. This avoids re-requesting the global sequence and lets the timeline panel hydrate on demand.

**Primary recommendation:** Add a `eventsSlice` to the Zustand store that accumulates events per session. Add `GET /api/sessions/:sessionId/events` to the daemon HTTP server. Build `TimelinePanel.tsx` as a pure React component reading from the store — no new npm packages needed.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TIMELINE-01 | User can view a replayable ordered event timeline per session showing all event types | Events are already in SQLite indexed by `(session_id, sequence_number)`; new `getEventsBySession` query + eventsSlice in store covers this |
| TIMELINE-02 | User can scrub and jump directly to approval or file-change events | Jump-to is a filtered index walk in React — `filteredEvents.findIndex(e => e.type === 'approval_request')` with a `currentIndex` cursor in component state |
| TIMELINE-03 | User can filter the timeline by event type | Filter state is local component state (`string | null`) applied to the `eventsSlice` array; no daemon involvement required |
| TIMELINE-04 | User can click a timeline event to open its related output, diff, or approval details inline | `selectedEvent` local state drives a conditional inline detail section below or beside the clicked row |
</phase_requirements>

---

## Standard Stack

### Core (no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3 (existing) | Timeline component, filter state, selected event state | Already in project |
| Zustand 5 | 5.0.11 (existing) | `eventsSlice` — accumulate per-session event arrays | Already in project; same pattern as `sessionsSlice` |
| `@cockpit/shared` | workspace (existing) | `NormalizedEvent` type for type-safe rendering | Already in project |
| Tailwind CSS 4 | 4.x (existing) | Timeline row styling, filter chips, inline detail layout | Already in project |
| `better-sqlite3` | 12.8.0 (existing) | New `getEventsBySession` query | Already in project |

### No New npm Dependencies

Phase 5 is pure UI + one new daemon query. No new npm packages.

**Installation:**
```bash
# No new packages required
```

---

## Architecture Patterns

### Recommended File Structure

```
packages/ui/src/
├── components/panels/
│   └── TimelinePanel.tsx          # REPLACE stub — full timeline + filter + jump-to + inline detail
├── store/
│   ├── index.ts                   # ADD eventsSlice fields + actions
│   └── eventsSlice.ts             # NEW — pure reducer: applyEventToEvents
└── __tests__/
    ├── eventsSlice.test.ts        # NEW — unit: accumulation, ordering, replay-safe
    └── TimelinePanel.test.tsx     # NEW — render + filter + jump-to + click-to-expand

packages/daemon/src/
├── db/
│   └── queries.ts                 # ADD getEventsBySession(db, sessionId)
└── ws/
    └── server.ts                  # ADD GET /api/sessions/:sessionId/events handler
```

### Pattern 1: Events Slice in Zustand Store

**What:** A second slice alongside `sessionsSlice` that holds `events: Record<string, NormalizedEvent[]>` — one ordered array per sessionId.

**When to use:** Always. Every event arriving via WebSocket is appended here. On session switch, the UI fetches history from the daemon if the array is empty.

**Example:**
```typescript
// packages/ui/src/store/eventsSlice.ts
import type { NormalizedEvent } from '@cockpit/shared'
import type { AppStore } from './index.js'

export function applyEventToEvents(
  state: Pick<AppStore, 'events'>,
  event: NormalizedEvent,
): Pick<AppStore, 'events'> {
  const sessionId = event.sessionId
  const existing = state.events[sessionId] ?? []
  // Guard: skip if this sequenceNumber already present (replay-safe)
  const seq = (event as NormalizedEvent & { sequenceNumber?: number }).sequenceNumber
  if (seq !== undefined && existing.some(e => (e as NormalizedEvent & { sequenceNumber?: number }).sequenceNumber === seq)) {
    return state
  }
  return {
    events: {
      ...state.events,
      [sessionId]: [...existing, event],
    },
  }
}
```

**Key design decision:** The array grows indefinitely while the UI is open. For v1 (single developer, short sessions), this is fine. The array is never trimmed in Phase 5.

### Pattern 2: getEventsBySession Daemon Query

**What:** A new SQLite query that returns all events for one session ordered by `sequence_number`. Called via `GET /api/sessions/:sessionId/events`.

**When to use:** When the timeline panel mounts for a session whose events array in the store is empty — i.e., the session existed before the UI connected.

**Example:**
```typescript
// packages/daemon/src/db/queries.ts — new export
export function getEventsBySession(
  db: Database.Database,
  sessionId: string,
): Array<NormalizedEvent & { sequenceNumber: number }> {
  const rows = db.prepare<[string], { payload: string; sequence_number: number }>(
    'SELECT payload, sequence_number FROM events WHERE session_id = ? ORDER BY sequence_number ASC'
  ).all(sessionId)
  return rows.map((row) => ({
    ...(JSON.parse(row.payload) as NormalizedEvent),
    sequenceNumber: row.sequence_number,
  }))
}
```

This query uses the existing `idx_events_session` composite index on `(session_id, sequence_number)`, so it is already covered by the Phase 1 schema.

### Pattern 3: HTTP Endpoint in ws/server.ts

**What:** Add a `GET /api/sessions/:sessionId/events` branch in the HTTP request handler inside `createWsServer`.

**When to use:** Once, at mount time if events array for the session is empty.

**Example:**
```typescript
// In httpServer.on('request', ...) inside createWsServer:
const eventsMatch = req.method === 'GET' && req.url?.match(/^\/api\/sessions\/([^/]+)\/events$/)
if (eventsMatch) {
  const sessionId = eventsMatch[1]!
  const events = getEventsBySession(db, sessionId)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(events))
  return
}
```

The CORS headers (`Access-Control-Allow-Origin: *`) are already set at the top of the request handler, so `OPTIONS` preflight for GET will return the correct headers.

### Pattern 4: TimelinePanel Component Structure

**What:** A single component file with local state for `filterType` and `selectedEvent`. Reads from the store's events slice and the daemon's HTTP endpoint.

**Layout:**
```
TimelinePanel
├── FilterBar          — chip buttons for each event type (all | tool_call | file_change | approval_request | ...)
├── JumpTo controls    — "↑ approval" / "↓ approval" / "↑ file change" / "↓ file change" buttons
├── Timeline list      — scrollable ordered list of EventRow items
│   └── EventRow       — icon + timestamp + type label + summary; click to expand
└── InlineDetail       — conditionally rendered below selected EventRow
    ├── ToolCallDetail     — toolName + input (JSON formatted)
    ├── FileChangeDetail   — filePath + changeType + diff (if present)
    ├── ApprovalDetail     — proposedAction + decision + riskLevel + whyRisky
    └── GenericDetail      — raw JSON fallback for other event types
```

**State model:**
```typescript
// All local component state — no Zustand UI state needed for this panel
const [filterType, setFilterType] = useState<string | null>(null)
const [selectedEventSeq, setSelectedEventSeq] = useState<number | null>(null)
const [jumpIndex, setJumpIndex] = useState<number>(0)
```

**Jump-to implementation:**
```typescript
// filteredEvents is already derived from the store slice
const jumpTargets = filteredEvents
  .map((e, i) => ({ e, i }))
  .filter(({ e }) => e.type === 'approval_request' || e.type === 'file_change')

function jumpNext() {
  const next = jumpTargets.find(({ i }) => i > jumpIndex)
  if (next) { setJumpIndex(next.i); scrollToIndex(next.i) }
}
function jumpPrev() {
  const prev = [...jumpTargets].reverse().find(({ i }) => i < jumpIndex)
  if (prev) { setJumpIndex(prev.i); scrollToIndex(prev.i) }
}
```

### Pattern 5: Hydration on Panel Mount

**What:** When `TimelinePanel` mounts for a session that has no events in the store, fetch from the daemon REST endpoint and bulk-apply events.

**Example:**
```typescript
useEffect(() => {
  if (!sessionId) return
  const existing = useStore.getState().events[sessionId]
  if (existing && existing.length > 0) return // already hydrated

  fetch(`http://localhost:3001/api/sessions/${sessionId}/events`)
    .then(r => r.json())
    .then((events: NormalizedEvent[]) => {
      useStore.getState().bulkApplyEvents(sessionId, events)
    })
    .catch(() => {/* silently ignore — live WS will catch up */})
}, [sessionId])
```

Add `bulkApplyEvents(sessionId, events)` to the Zustand store as a batch setter that sets `events[sessionId] = events` directly, bypassing the dedup guard.

### Anti-Patterns to Avoid

- **Re-fetching on every render:** Use `useEffect` with a guard checking `existing.length > 0`. Only fetch once.
- **Storing events in component state:** Events belong in the Zustand store so they survive panel navigation (OPS-03 requirement: switching panels does not lose state).
- **Sorting in the component:** Events arrive in `sequenceNumber` order from both WS and REST; do not re-sort. Only filter.
- **Using `useFilteredSessions` pattern for events:** That pattern uses `useRef` to cache the array reference. For events, use a direct selector with `shallow` equality from Zustand 5 if needed, or keep the filter as a derived value inside the component render (acceptable for moderate event counts).
- **Inline diff rendering with a custom parser:** Phase 5 shows the diff string as pre-formatted text. Full syntax-highlighted diff is Phase 6.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Event ordering | Custom sort algorithm | Rely on SQLite `ORDER BY sequence_number ASC` (REST) and append-only WS stream | Already guaranteed by architecture; sorting adds O(n log n) on every render |
| Scroll-to-index | DOM manipulation with refs per row | A single `ref` on the scrollable container + `element.scrollIntoView({ block: 'nearest' })` | Built-in browser API; no library needed for this scale |
| Event type icons | Custom SVG library | Tailwind + Unicode/emoji or simple text badges | Keeps zero new dependencies |
| JSON formatting in detail view | Custom formatter | `JSON.stringify(value, null, 2)` in a `<pre>` tag | Standard; sufficient for v1 |
| Diff display | Custom diff parser | Raw `event.diff` string in a `<pre>` with whitespace-pre | Phase 6 adds Monaco; Phase 5 only needs readable text |

**Key insight:** The events are already stored, ordered, and typed. The timeline is a read-only view. The only logic is filtering and scrolling — neither requires a library.

---

## Common Pitfalls

### Pitfall 1: Infinite Re-Render from Events Selector
**What goes wrong:** `useStore(s => s.events[sessionId] ?? [])` returns a new `[]` reference every render when no events exist, triggering Zustand's change detection and causing an infinite re-render loop.
**Why it happens:** `[]` is a new reference each time; Zustand's default `Object.is` equality sees it as changed.
**How to avoid:** Initialize the events slice so every session always has an array once it exists: `s.events[sessionId] ?? EMPTY_ARRAY` where `EMPTY_ARRAY` is a module-level constant, or use `shallow` equality from `zustand/shallow`.
**Warning signs:** DevTools shows the component re-rendering continuously even without new WebSocket messages.

### Pitfall 2: Duplicate Events on Hydration
**What goes wrong:** The timeline fetches history from REST at mount time. Meanwhile, the WebSocket has already delivered some of those same events (catch-up replay). The store ends up with duplicates.
**Why it happens:** WS catch-up sends all events since `lastSeenSequence=0` globally. The REST endpoint also returns all events for the session.
**How to avoid:** The `applyEventToEvents` reducer must check `sequenceNumber` deduplication before appending. The `bulkApplyEvents` action (used by REST hydration) sets the array directly and should be called **before** any individual WS events are processed — or it should merge and deduplicate by sequenceNumber.
**Better approach:** Use `bulkApplyEvents` as "replace if currently empty". Once hydrated, individual WS events go through the dedup guard. The sequence is: (1) REST fetch → `bulkApplyEvents`; (2) subsequent WS events → `applyEventToEvents` with dedup.

### Pitfall 3: CORS on GET Requests
**What goes wrong:** The existing `CORS` headers in `ws/server.ts` set `Access-Control-Allow-Methods: 'POST, OPTIONS'` — GET is not listed. The browser blocks the `GET /api/sessions/:sessionId/events` request.
**Why it happens:** The CORS config was written when only POST endpoints existed.
**How to avoid:** When adding the GET endpoint, update the CORS header to `'GET, POST, OPTIONS'`.

### Pitfall 4: Large Payload from REST Endpoint
**What goes wrong:** A long session with 10,000 events returns a large JSON payload that blocks the browser's main thread during parsing.
**Why it happens:** `JSON.parse` is synchronous and blocks for large strings.
**How to avoid:** For v1, sessions are short (developer use). Document the limit (acceptable up to ~1,000 events). Do not add pagination in Phase 5. Add it as a concern for Phase 8 (History & Search).

### Pitfall 5: Jump-to with Filtered Views
**What goes wrong:** Jump-to next approval navigates to the wrong visual position when a filter is active (e.g., "show only tool calls" hides all approval rows).
**Why it happens:** The jump index is computed on `filteredEvents` but the jump targets (approval/file-change) are removed by the filter.
**How to avoid:** Jump-to controls operate on the **unfiltered** event list. When the user clicks jump-to, temporarily clear the filter, scroll to the target event, and highlight it. Or: keep jump-to always visible but disable it when no valid targets exist in the filtered view.

### Pitfall 6: `event.type` Label Display
**What goes wrong:** Showing raw `type` values like `approval_request` looks ugly in the UI.
**Why it happens:** The `NormalizedEvent` `type` field uses snake_case identifiers.
**How to avoid:** Maintain a simple display-name map:
```typescript
const EVENT_TYPE_LABELS: Record<string, string> = {
  session_start: 'Session Started',
  session_end: 'Session Ended',
  tool_call: 'Tool Call',
  file_change: 'File Change',
  approval_request: 'Approval Requested',
  approval_resolved: 'Approval Resolved',
  subagent_spawn: 'Subagent Spawned',
  subagent_complete: 'Subagent Completed',
  memory_read: 'Memory Read',
  memory_write: 'Memory Written',
  provider_parse_error: 'Parse Error',
}
```

---

## Code Examples

Verified patterns from project source:

### Zustand Slice Pattern (from existing sessionsSlice.ts)
```typescript
// Source: packages/ui/src/store/sessionsSlice.ts
// Same pure-reducer pattern used for eventsSlice
export function applyEventToSessions(
  state: Pick<AppStore, 'sessions'>,
  event: NormalizedEvent,
): Pick<AppStore, 'sessions'> {
  // ... pure function, no side effects
}
```

### Existing DB Query Pattern (from queries.ts)
```typescript
// Source: packages/daemon/src/db/queries.ts
export function getEventsSince(
  db: Database.Database,
  lastSeenSequence: number,
): Array<NormalizedEvent & { sequenceNumber: number }> {
  const rows = db.prepare<[number], { payload: string; sequence_number: number }>(
    'SELECT payload, sequence_number FROM events WHERE sequence_number > ? ORDER BY sequence_number ASC'
  ).all(lastSeenSequence)
  return rows.map((row) => ({
    ...(JSON.parse(row.payload) as NormalizedEvent),
    sequenceNumber: row.sequence_number,
  }))
}
// getEventsBySession follows the same pattern with WHERE session_id = ?
```

### HTTP Route Pattern (from ws/server.ts)
```typescript
// Source: packages/daemon/src/ws/server.ts
// Existing POST handler:
if (req.method === 'POST' && req.url === '/api/sessions') {
  handleLaunchSession(req, res, db)
  return
}
// New GET handler uses same structure:
// if (req.method === 'GET' && req.url?.startsWith('/api/sessions/')) { ... }
```

### Existing Composite Index (from database.ts)
```sql
-- Source: packages/daemon/src/db/database.ts
CREATE INDEX IF NOT EXISTS idx_events_session
  ON events (session_id, sequence_number);
-- This index already covers getEventsBySession ORDER BY sequence_number ASC
```

### React Router Lazy Panel (from router.tsx)
```typescript
// Source: packages/ui/src/router.tsx
// TimelinePanel is already wired as a lazy route at /session/:sessionId/timeline
{
  path: 'timeline',
  lazy: () =>
    import('./components/panels/TimelinePanel.js').then((m) => ({ Component: m.TimelinePanel })),
},
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Global event log only | Per-session event arrays in Zustand | Phase 5 (new) | Enables per-session timeline without refetching all events |
| No REST history endpoint | `GET /api/sessions/:id/events` | Phase 5 (new) | Panel hydration on mount for pre-existing sessions |
| Stub TimelinePanel | Full interactive panel | Phase 5 (new) | TIMELINE-01 through TIMELINE-04 satisfied |

**Not yet in scope for Phase 5:**
- Syntax-highlighted diff rendering (Phase 6 adds Monaco)
- Full-text search within timeline (Phase 8)
- Virtualized long lists (not needed at v1 scale — document limit as ~1,000 events)

---

## Open Questions

1. **Should jump-to operate on filtered or unfiltered events?**
   - What we know: Both UX choices are defensible. Jump-to unfiltered is more useful (the user wants to find approval events regardless of filter).
   - What's unclear: Whether the requirement "without scrolling through all events" implies jump-to should work across all events or only within the current filter.
   - Recommendation: Jump-to always operates on the unfiltered list. Clicking jump-to while a filter is active clears the filter and scrolls to the target. Simple, predictable.

2. **CORS header scope for GET endpoint**
   - What we know: The existing `Access-Control-Allow-Methods` is `'POST, OPTIONS'`.
   - What's unclear: Whether any other test depends on this string literally.
   - Recommendation: Update to `'GET, POST, OPTIONS'` in the same commit as the GET endpoint. Check `launch-session.test.ts` for any CORS assertions.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file (ui) | `packages/ui/vitest.config.ts` |
| Config file (daemon) | `packages/daemon/vitest.config.ts` |
| Quick run command (ui) | `pnpm --filter @cockpit/ui test --run` |
| Quick run command (daemon) | `pnpm --filter @cockpit/daemon test --run` |
| Full suite command | `pnpm -r test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TIMELINE-01 | `applyEventToEvents` accumulates all event types per session | unit | `pnpm --filter @cockpit/ui test --run eventsSlice` | ❌ Wave 0 |
| TIMELINE-01 | `getEventsBySession` returns events ordered by sequence_number | unit | `pnpm --filter @cockpit/daemon test --run database` | ❌ Wave 0 (new test in existing file) |
| TIMELINE-01 | `GET /api/sessions/:id/events` returns 200 with events JSON | integration | `pnpm --filter @cockpit/daemon test --run launch-session` | ❌ Wave 0 (new test in existing file) |
| TIMELINE-01 | TimelinePanel renders all event type rows | unit (RTL) | `pnpm --filter @cockpit/ui test --run TimelinePanel` | ❌ Wave 0 |
| TIMELINE-02 | Jump-to-next-approval scrolls to correct event | unit (RTL) | `pnpm --filter @cockpit/ui test --run TimelinePanel` | ❌ Wave 0 |
| TIMELINE-03 | Filter chip hides/shows events by type | unit (RTL) | `pnpm --filter @cockpit/ui test --run TimelinePanel` | ❌ Wave 0 |
| TIMELINE-04 | Clicking an event row renders inline detail | unit (RTL) | `pnpm --filter @cockpit/ui test --run TimelinePanel` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @cockpit/ui test --run && pnpm --filter @cockpit/daemon test --run`
- **Per wave merge:** `pnpm -r test --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/ui/src/store/eventsSlice.ts` — module + exports (created in Wave 0 as stub)
- [ ] `packages/ui/src/__tests__/eventsSlice.test.ts` — covers TIMELINE-01 (accumulation + dedup)
- [ ] `packages/ui/src/__tests__/TimelinePanel.test.tsx` — covers TIMELINE-01 through TIMELINE-04
- [ ] New test cases in `packages/daemon/src/__tests__/database.test.ts` — covers `getEventsBySession`
- [ ] New test cases in `packages/daemon/src/__tests__/launch-session.test.ts` — covers `GET /api/sessions/:id/events`

---

## Sources

### Primary (HIGH confidence)
- Project source — `packages/shared/src/events.ts` — full `NormalizedEvent` discriminated union schema
- Project source — `packages/daemon/src/db/database.ts` — existing schema including `idx_events_session` composite index
- Project source — `packages/daemon/src/db/queries.ts` — `persistEvent` and `getEventsSince` query patterns
- Project source — `packages/daemon/src/ws/server.ts` — existing HTTP route structure, CORS headers
- Project source — `packages/ui/src/store/index.ts` — Zustand store architecture, slice separation pattern
- Project source — `packages/ui/src/store/sessionsSlice.ts` — pure reducer pattern for `applyEventToSessions`
- Project source — `packages/ui/src/store/selectors.ts` — `useFilteredSessions` pattern including `useRef` dedup guard
- Project source — `packages/ui/src/router.tsx` — lazy route for `TimelinePanel` already registered
- Project source — `packages/ui/src/components/panels/TimelinePanel.tsx` — current stub

### Secondary (MEDIUM confidence)
- Zustand 5 docs — subscribeWithSelector middleware, slice pattern, store composition

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing packages; no new dependencies
- Architecture: HIGH — derived directly from existing codebase patterns and schema
- Pitfalls: HIGH — dedup and CORS pitfalls derived from reading actual code; re-render pitfall from observed Zustand pattern in selectors.ts

**Research date:** 2026-04-06
**Valid until:** 2026-05-06 (stable stack; no fast-moving dependencies)
