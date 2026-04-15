# Phase 6: Diff & Artifact Review - Research

**Researched:** 2026-04-06
**Domain:** React diff viewer UI, Zustand diff slice, session summary derivation, file-tree component
**Confidence:** HIGH

---

## Summary

Phase 6 replaces the `DiffPanel.tsx` stub with a fully working diff and artifact review panel. The panel must show a file tree of all files the agent changed during the session (DIFF-01), a per-file raw diff view when the user clicks a file in the tree (DIFF-02), and a session summary banner at the top showing files-touched count, final status, and elapsed time (DIFF-03).

All the data needed for this phase is already available. The Zustand `eventsSlice` (from Phase 5) accumulates every `NormalizedEvent` per session, including all `file_change` events. Each `file_change` event already carries `filePath`, `changeType` (`created` | `modified` | `deleted`), and an optional `diff` string. The diff panel simply reads from the existing store slice — no new daemon endpoints are required for the core feature. A session summary can be derived from the same events array (first `session_start` timestamp vs. last event timestamp) plus the `SessionRecord.status` already in the sessions slice.

The raw diff string format emitted by the Claude adapter is unified diff format (git-style `---`/`+++`/`@@` headers with `+`/`-` prefix lines). For v1, rendering it in a `<pre>` tag with per-line colorization (green for additions, red for deletions) is sufficient and requires zero new npm packages. Full syntax-highlighted diff (Monaco editor or `react-diff-viewer`) would be appropriate for v2 but is explicitly not required for DIFF-02, which only asks for "raw diff view showing exact lines added and removed."

**Primary recommendation:** Build `DiffPanel.tsx` as a pure React component reading from the existing `eventsSlice`. Derive the file tree from `file_change` events. Render the per-file diff as colorized `<pre>` text. Derive the session summary from store data. No new npm packages required.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DIFF-01 | User can see a file tree of all files changed during a session, updated as new file-change events arrive | `file_change` events are already in `eventsSlice` (populated by Phase 5). Derive `Set<filePath>` per session from the events array. React re-renders automatically as new events arrive via WebSocket. |
| DIFF-02 | User can inspect a per-file raw diff view for any file changed in a session | Each `file_change` event carries `event.diff?: string` (optional). Show the unified diff string in a `<pre>` tag with line-by-line `+`/`-` colorization. Handle the case where `diff` is absent (show "no diff available"). |
| DIFF-03 | User can see a session summary showing files touched, final status, and elapsed time | Files touched = size of the derived file set (collapsed across multiple changes to the same file). Status = `SessionRecord.status`. Elapsed time = `session_end` event timestamp (or `lastEventAt` if still active) minus `session_start` event timestamp. All data available in existing store. |
</phase_requirements>

---

## Standard Stack

### Core (no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3 (existing) | DiffPanel component, local selectedFile state, derived file tree | Already in project |
| Zustand 5 | 5.0.11 (existing) | Read `eventsSlice.events[sessionId]` and `sessionsSlice.sessions[sessionId]` | Already in project |
| `@cockpit/shared` | workspace (existing) | `NormalizedEvent`, `FileChangeEvent` type for filtering | Already in project |
| Tailwind CSS 4 | 4.x (existing) | File tree row styling, diff colorization via conditional classes, summary header | Already in project |

### No New npm Dependencies

Phase 6 is pure UI composition on existing store data. No new npm packages.

**Installation:**
```bash
# No new packages required
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `<pre>` + per-line colorization | `react-diff-viewer-continued` | Library adds ~50KB; per-line coloring is 10 lines of code and satisfies DIFF-02. Use library only if syntax highlighting becomes required (v2). |
| `<pre>` + per-line colorization | Monaco Editor | Monaco is ~2MB; massive overkill for read-only diff display. Phase 6 does not require editing. |
| Deriving summary from events | Daemon-side `GET /api/sessions/:id/summary` endpoint | An extra HTTP endpoint adds complexity with no benefit — all needed data is in the store already. |

---

## Architecture Patterns

### Recommended File Structure

```
packages/ui/src/
├── components/panels/
│   └── DiffPanel.tsx               # REPLACE stub — full diff panel
├── store/
│   └── index.ts                    # No change required
└── __tests__/
    └── DiffPanel.test.tsx          # NEW — RTL tests covering DIFF-01, 02, 03
```

No daemon changes required.

### Pattern 1: Derive File Tree from eventsSlice

**What:** Filter the session's events array to `file_change` events. Collapse multiple changes to the same file into one entry (last change wins for `changeType`). Produce an array of `{ filePath, changeType, latestDiff }` objects, sorted by filePath.

**When to use:** At render time inside `DiffPanel.tsx`. This is a pure derived computation — no separate slice or memoization needed at v1 scale.

**Example:**
```typescript
// Inside DiffPanel component
import type { NormalizedEvent } from '@cockpit/shared'
import { EMPTY_EVENTS } from '../../store/eventsSlice.js'

interface FileEntry {
  filePath: string
  changeType: 'created' | 'modified' | 'deleted'
  diff?: string
}

function deriveFileTree(events: NormalizedEvent[]): FileEntry[] {
  const map = new Map<string, FileEntry>()
  for (const event of events) {
    if (event.type === 'file_change') {
      map.set(event.filePath, {
        filePath: event.filePath,
        changeType: event.changeType,
        diff: event.diff,
      })
    }
  }
  return [...map.values()].sort((a, b) => a.filePath.localeCompare(b.filePath))
}
```

**Key design decision:** "Last write wins" for the same filePath — if the agent modified a file twice (two `file_change` events), only the most recent diff is shown. This is the correct behavior: the final diff represents the cumulative change.

### Pattern 2: Per-Line Diff Colorization

**What:** Split the unified diff string on newlines. Apply conditional Tailwind classes to each line based on its first character: `+` → green, `-` → red, `@` → blue/muted, space → default.

**When to use:** When rendering `event.diff` for the selected file.

**Example:**
```typescript
function DiffView({ diff }: { diff: string }) {
  const lines = diff.split('\n')
  return (
    <pre className="text-xs font-mono overflow-x-auto p-3">
      {lines.map((line, i) => {
        const cls =
          line.startsWith('+') && !line.startsWith('+++')
            ? 'text-green-600 bg-green-50'
            : line.startsWith('-') && !line.startsWith('---')
            ? 'text-red-600 bg-red-50'
            : line.startsWith('@')
            ? 'text-blue-500'
            : ''
        return (
          <div key={i} className={cls}>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}
```

**Warning:** Lines starting with `+++` or `---` are diff header lines, not additions/deletions. Check both conditions to avoid false colorization.

### Pattern 3: Session Summary Derivation

**What:** Compute files touched count, final status, and elapsed time from data already in the store.

**When to use:** At the top of `DiffPanel.tsx` as a summary banner.

**Example:**
```typescript
// Inside DiffPanel component
const session = useStore((s) => (sessionId ? s.sessions[sessionId] : undefined))
const events = useStore((s) => s.events[sessionId!] ?? EMPTY_EVENTS)

// Files touched: unique file paths
const filesTouched = new Set(
  events.filter((e) => e.type === 'file_change').map((e) => (e as FileChangeEvent).filePath)
).size

// Status: from SessionRecord
const finalStatus = session?.status ?? 'unknown'

// Elapsed time: session_end timestamp (or lastEventAt) minus session_start
const startEvent = events.find((e) => e.type === 'session_start')
const endEvent = [...events].reverse().find((e) => e.type === 'session_end')
const startTime = startEvent ? new Date(startEvent.timestamp).getTime() : null
const endTime = endEvent
  ? new Date(endEvent.timestamp).getTime()
  : session?.lastEventAt
  ? new Date(session.lastEventAt).getTime()
  : null
const elapsedMs = startTime && endTime ? endTime - startTime : null
```

**Format elapsed time:** `formatElapsed(ms)` → "2m 34s" or "45s". Keep it a simple pure function.

### Pattern 4: DiffPanel Layout

**What:** Two-column layout (narrow file tree on left, diff view on right) with a summary banner at the top.

**Layout:**
```
DiffPanel
├── SummaryBanner           — files touched count | status badge | elapsed time
└── Body (flex row)
    ├── FileTree            — sorted list of filePaths with changeType badge
    │   └── FileRow         — click to select; highlight selected
    └── DiffView            — shows diff for selected file, or empty state
```

**State model (local):**
```typescript
const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
```

Only one piece of local state needed. Everything else is derived from the Zustand store.

### Pattern 5: Real-time Updates

**What:** As new `file_change` events arrive via WebSocket, the file tree updates automatically because `DiffPanel` reads directly from `eventsSlice`. No subscription or effect needed.

**When to use:** Inherent behavior — React re-renders when the Zustand store slice changes.

**Pitfall:** If the user has a file selected and a new event for that same file arrives (agent updated the file again), the diff view should update automatically. Since `selectedFilePath` is just a string key and `deriveFileTree` always uses the latest events, this works correctly with no special handling.

### Anti-Patterns to Avoid

- **Separate Redux/Zustand slice for diff state:** The file tree is derived data from `eventsSlice`. Don't store it in the Zustand store; compute it at render time.
- **Custom diff parser:** The `event.diff` field already contains the unified diff string from the agent. Don't re-parse or re-compute it.
- **Fetching diff from daemon:** The diff is embedded in the event payload stored in SQLite and returned via the existing `GET /api/sessions/:id/events` endpoint that Phase 5 already added. No new endpoint needed.
- **Monaco Editor:** 2MB for read-only display is unwarranted. The `<pre>` + line colorization approach fully satisfies DIFF-02.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unified diff parsing | Custom parser for `---`/`+++`/`@@` | Simple line-prefix check on `event.diff` string | The diff is already parsed by the agent; we only need to display it |
| File tree expand/collapse | Recursive tree component with folder grouping | Flat sorted list of file paths | v1 has no folder hierarchy requirement — a flat list satisfies DIFF-01 |
| Virtualized file list | `react-window` or `tanstack-virtual` | Plain mapped `<div>` list | Sessions produce at most hundreds of file changes; virtualization unnecessary at this scale |
| Diff syntax highlighting | `highlight.js` or `prism.js` | Tailwind color classes on line prefix | DIFF-02 says "raw diff view" — color by prefix fully satisfies the requirement |

**Key insight:** The requirement says "raw diff view showing exact lines added and removed." Raw means minimal processing. The diff string is already in unified diff format — display it with line colorization and nothing more.

---

## Common Pitfalls

### Pitfall 1: Showing `+++`/`---` Header Lines as Green/Red
**What goes wrong:** The unified diff header lines (`--- a/file.ts` and `+++ b/file.ts`) start with `+`/`-` characters, triggering false colorization in the diff view.
**Why it happens:** The colorization logic only checks the first character.
**How to avoid:** Add a guard: `line.startsWith('+') && !line.startsWith('+++')` for green, `line.startsWith('-') && !line.startsWith('---')` for red.
**Warning signs:** File header lines appear green/red in the rendered diff.

### Pitfall 2: Missing `diff` Field on file_change Events
**What goes wrong:** The `FileChangeEvent.diff` field is optional in the schema. Some adapters may emit `file_change` events without a diff string (e.g., for large binary files or events that only record that a change occurred).
**Why it happens:** `diff: z.string().optional()` in the Zod schema — absence is valid.
**How to avoid:** Always render a fallback: "No diff available for this file" when `event.diff` is undefined.
**Warning signs:** Diff view is blank or throws when accessing `.split('\n')` on undefined.

### Pitfall 3: Multiple file_change Events for Same File
**What goes wrong:** An agent modifies the same file three times. The file tree shows the file three times, or the diff view only shows the first change.
**Why it happens:** Each `file_change` event is a separate entry in the events array. Naively mapping events to file rows produces duplicates.
**How to avoid:** Use a `Map<filePath, FileEntry>` to collapse entries. Last write wins — the final diff for that file reflects the cumulative state. This is the correct semantic: the user wants to see what the file looks like now, not the history of individual writes.

### Pitfall 4: Elapsed Time When Session Still Active
**What goes wrong:** For an active session, there is no `session_end` event. Computing `endTime - startTime` produces NaN or 0.
**Why it happens:** `session_end` hasn't arrived yet.
**How to avoid:** Fall back to `session.lastEventAt` as `endTime` when no `session_end` event exists. This shows elapsed time as "time since last activity" for live sessions — clearly labeled as "running" in the status badge.

### Pitfall 5: Selected File Disappears After Re-Render
**What goes wrong:** The user selects a file. A new `file_change` event arrives for a different file. The component re-renders. The selected file is still highlighted correctly, but if the `selectedFilePath` key no longer exists in the derived tree (e.g., the agent deleted the file and the new event removed it), the diff view shows nothing without a clear explanation.
**Why it happens:** The selected file key may become stale if `deriveFileTree` removes an entry.
**How to avoid:** In practice this is rare — "deleted" files still appear in the tree with `changeType: 'deleted'`. But add a guard: if `selectedFilePath` is not in the current file tree, show an empty state ("File no longer tracked") rather than a blank view.

### Pitfall 6: Zustand Selector Returns New Array Reference Each Render
**What goes wrong:** `useStore(s => s.events[sessionId!] ?? [])` returns a new `[]` reference every render when no events exist, causing infinite re-renders.
**Why it happens:** Same pattern as Phase 5 Pitfall 1 — `[]` is a new reference.
**How to avoid:** Use `EMPTY_EVENTS` exported from `eventsSlice.ts` (module-level constant). Already established in Phase 5: `import { EMPTY_EVENTS } from '../../store/eventsSlice.js'`.
**Warning signs:** DevTools shows the component re-rendering continuously.

---

## Code Examples

Verified patterns from project source:

### Reading eventsSlice in a Panel (Phase 5 pattern)
```typescript
// Source: packages/ui/src/components/panels/TimelinePanel.tsx
import { EMPTY_EVENTS } from '../../store/eventsSlice.js'

// In component:
const events = useStore((s) => s.events[sessionId!] ?? EMPTY_EVENTS)
```
DiffPanel uses the same pattern. `EMPTY_EVENTS` is the stable module-level constant that prevents infinite re-render.

### Reading SessionRecord in a Panel (Phase 3 pattern)
```typescript
// Source: packages/ui/src/components/layout/SessionDetailPanel.tsx
const session = useStore((s) => (sessionId ? s.sessions[sessionId] : undefined))
```
DiffPanel reads `session.status`, `session.startedAt`, and `session.lastEventAt` via this selector.

### Route Registration (already wired in router.tsx)
```typescript
// Source: packages/ui/src/router.tsx
{
  path: 'diff',
  lazy: () =>
    import('./components/panels/DiffPanel.js').then((m) => ({ Component: m.DiffPanel })),
},
```
The `diff` route is already registered. DiffPanel just needs to export `DiffPanel`.

### FileChangeEvent Type Access
```typescript
// Source: packages/shared/src/events.ts
export const FileChangeEvent = BaseEvent.extend({
  type: z.literal('file_change'),
  filePath: z.string(),
  changeType: z.enum(['created', 'modified', 'deleted']),
  diff: z.string().optional(),
})
// Type: { filePath: string; changeType: 'created' | 'modified' | 'deleted'; diff?: string }
```
Filter events with `event.type === 'file_change'` then cast: `event as z.infer<typeof FileChangeEvent>`.

### Existing RTL Test Pattern (Phase 5)
```typescript
// Source: packages/ui/src/__tests__/TimelinePanel.test.tsx
function renderPanel(sessionId: string) {
  return render(
    <MemoryRouter initialEntries={[`/session/${sessionId}/diff`]}>
      <Routes>
        <Route path="/session/:sessionId/diff" element={<DiffPanel />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useStore.setState({ events: {}, sessions: {} })
})
```
DiffPanel tests follow the exact same scaffolding.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DiffPanel stub (empty) | Full file-tree + per-file diff view | Phase 6 (this phase) | DIFF-01 and DIFF-02 satisfied |
| No session summary | Summary banner: files touched, status, elapsed | Phase 6 (this phase) | DIFF-03 satisfied |
| Phase 5 research suggested "Phase 6 adds Monaco" | Per-line colorized `<pre>` is sufficient for v1 | Phase 6 decision | Keeps zero new dependencies |

**Not yet in scope:**
- Syntax highlighting within diff hunks (Monaco / highlight.js) — v2 only
- Side-by-side diff view (left/right pane) — not required by DIFF-02
- Diff for binary files — not supported; show "Binary file changed" message

---

## Open Questions

1. **Does `event.diff` contain the full file diff or only the hunk?**
   - What we know: The Claude adapter hook captures the `diff` field from Claude's `PostToolUse` hook payload. The hook payload includes whatever diff Claude provides. For `write_file` operations this is typically the full replacement (not a git diff). For edit operations it is a unified diff hunk.
   - What's unclear: Whether the diff string format is consistent across all change types (`created`, `modified`, `deleted`).
   - Recommendation: Render whatever is in `event.diff` as-is. Add a fallback message when `diff` is absent or empty. Do not attempt to normalize the format in Phase 6.

2. **Should the file tree show folder structure or a flat list?**
   - What we know: DIFF-01 says "file tree" — but the success criteria say "file tree of every file changed." The requirement does not mandate folder grouping.
   - What's unclear: Whether "tree" implies hierarchical folders or just a list of file paths.
   - Recommendation: Implement as a flat sorted list for Phase 6. Path segments can be truncated with the basename shown prominently and the directory path shown in muted text. Full hierarchical folder grouping is a UX enhancement for a later phase.

3. **Elapsed time label for active sessions**
   - What we know: Active sessions have no `session_end` event. `session.lastEventAt` is available as a fallback.
   - What's unclear: Whether showing "elapsed since last event" vs. real-time elapsed (counting up) is more useful.
   - Recommendation: Show static elapsed (from `startedAt` to `lastEventAt`) with status "active" badge. Real-time countdown would require a `setInterval` and adds complexity for no clear benefit.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file (ui) | `packages/ui/vitest.config.ts` |
| Quick run command | `pnpm --filter @cockpit/ui test --run` |
| Full suite command | `pnpm -r test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DIFF-01 | DiffPanel renders file tree from file_change events in store | unit (RTL) | `pnpm --filter @cockpit/ui test --run DiffPanel` | ❌ Wave 0 |
| DIFF-01 | Multiple events for same file collapsed to single row | unit (RTL) | `pnpm --filter @cockpit/ui test --run DiffPanel` | ❌ Wave 0 |
| DIFF-01 | File tree updates when new file_change event added to store | unit (RTL) | `pnpm --filter @cockpit/ui test --run DiffPanel` | ❌ Wave 0 |
| DIFF-02 | Clicking a file row renders diff view for that file | unit (RTL) | `pnpm --filter @cockpit/ui test --run DiffPanel` | ❌ Wave 0 |
| DIFF-02 | Diff view renders `+` lines in green and `-` lines in red | unit (RTL) | `pnpm --filter @cockpit/ui test --run DiffPanel` | ❌ Wave 0 |
| DIFF-02 | Diff view shows fallback when event.diff is absent | unit (RTL) | `pnpm --filter @cockpit/ui test --run DiffPanel` | ❌ Wave 0 |
| DIFF-03 | Summary banner shows files-touched count | unit (RTL) | `pnpm --filter @cockpit/ui test --run DiffPanel` | ❌ Wave 0 |
| DIFF-03 | Summary banner shows session status | unit (RTL) | `pnpm --filter @cockpit/ui test --run DiffPanel` | ❌ Wave 0 |
| DIFF-03 | Summary banner shows elapsed time derived from start/end events | unit (RTL) | `pnpm --filter @cockpit/ui test --run DiffPanel` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @cockpit/ui test --run`
- **Per wave merge:** `pnpm -r test --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/ui/src/__tests__/DiffPanel.test.tsx` — covers DIFF-01, DIFF-02, DIFF-03 (all new)

*(No daemon changes needed; no daemon test gaps.)*

---

## Sources

### Primary (HIGH confidence)
- Project source — `packages/shared/src/events.ts` — `FileChangeEvent` schema with `filePath`, `changeType`, `diff?: string` confirmed
- Project source — `packages/ui/src/store/eventsSlice.ts` — `EMPTY_EVENTS` constant, `getSessionEvents` pattern confirmed
- Project source — `packages/ui/src/store/index.ts` — `SessionRecord` type (`status`, `startedAt`, `lastEventAt`) confirmed
- Project source — `packages/ui/src/components/panels/DiffPanel.tsx` — current stub confirmed (empty, ready to replace)
- Project source — `packages/ui/src/router.tsx` — `diff` route already registered with lazy import
- Project source — `packages/ui/src/components/panels/TimelinePanel.tsx` — Phase 5 component patterns (useParams, EMPTY_EVENTS, useStore, MemoryRouter test helper)
- Project source — `packages/ui/src/__tests__/TimelinePanel.test.tsx` — established RTL test scaffolding pattern
- Project source — `packages/ui/package.json` — no diff library in dependencies; confirmed zero new deps needed
- Project source — `packages/daemon/src/db/queries.ts` — `getEventsBySession` already returns `diff` field embedded in `payload`

### Secondary (MEDIUM confidence)
- Phase 5 RESEARCH.md — `InlineDetail` for `file_change` already renders `event.diff` as `<pre>` text; confirms the diff string format is preformatted unified diff ready for display

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing packages; no new dependencies; data confirmed in schema
- Architecture: HIGH — directly derived from existing codebase; Phase 5 already renders diffs in pre tags; same patterns apply
- Pitfalls: HIGH — pitfalls derived from reading actual schema (optional diff), actual store patterns (EMPTY_EVENTS), and direct Phase 5 precedent

**Research date:** 2026-04-06
**Valid until:** 2026-05-06 (stable stack; no fast-moving dependencies)
