# Phase 8: Session History & Search - Research

**Researched:** 2026-04-07
**Domain:** SQLite FTS5 full-text search, React read-only session view, side-by-side comparison UI
**Confidence:** HIGH

## Summary

Phase 8 adds three distinct capabilities on top of the already-complete data layer: full-text search across the SQLite event log, a filterable session history list where past sessions open in read-only view, and a side-by-side session comparison panel. The daemon already stores every event, approval, and memory note in SQLite with a consistent schema — the main work is exposing that data through new REST endpoints and building three new UI surfaces.

The search requirement (HIST-01) must return results within two seconds across 50+ sessions. SQLite's built-in FTS5 extension is the correct choice: it is bundled in better-sqlite3 with no extra dependency, supports fast BM25-ranked queries, and can index all searchable text in a single virtual table. A trigram approach (LIKE queries) would be too slow at 50+ sessions; FTS5 is the right tool.

The history list (HIST-02) reuses filters already built in the SessionListPanel (provider, status, search). The read-only session view reuses existing panels (TimelinePanel, DiffPanel, MemoryPanel) with a `readOnly` prop guard — no new data-fetching logic is needed. The comparison panel (COMP-01) is a pure UI component: it receives two SessionRecord objects and renders a two-column layout of computed summary stats.

**Primary recommendation:** Add an FTS5 virtual table in a new DB migration, expose `GET /api/search?q=` and `GET /api/sessions` endpoints on the daemon, add a History page to the React router, and implement three small UI components (SearchResultList, HistoryPanel, ComparePanel).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HIST-01 | Full-text search across sessions, task titles, memory items, file-change records, and approval history — returns results within two seconds even with 50+ sessions | FTS5 virtual table on events.payload + approvals + memory_notes; single `GET /api/search?q=` endpoint; client debounce 300ms |
| HIST-02 | Browsable, filterable session history list; clicking any past session opens its timeline, memory, and diffs as a read-only view | `GET /api/sessions` REST endpoint returning all sessions; read-only mode flag passed to existing panels; new `/history` route |
| COMP-01 | Select any two sessions and view side-by-side comparison: provider, runtime, approval count, files changed, final status | `GET /api/sessions/:id/summary` or computed from existing events data; ComparePanel stateless component receiving two SessionRecord + derived summaries |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | ^12.8.0 (already installed) | FTS5 virtual table, search queries | Already in project; FTS5 is bundled in SQLite — no new dependency |
| React + Zustand | ^18.3 / ^5.0 (already installed) | History page state, comparison selection | Already the project UI stack |
| React Router v7 | ^7.0.0 (already installed) | New `/history` route | Already wired in router.tsx |
| Tailwind CSS v4 | ^4.0.0 (already installed) | Layout for side-by-side comparison | Already the project styling system |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest + RTL | ^3.0.0 / ^16.0.0 (already installed) | Tests for new endpoints and components | Same test pattern as all prior phases |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SQLite FTS5 (recommended) | LIKE queries | LIKE is O(n) per row and fails the 2-second SLA at 50+ sessions; FTS5 is indexed |
| SQLite FTS5 | Client-side JS search (e.g. Fuse.js) | Client-side means sending all event payloads to browser first — 50 sessions × many events would violate the 2-second SLA and waste bandwidth |
| SQLite FTS5 | Trigram-based pg_trgm | Project is SQLite-only; no Postgres |

**Installation:** No new packages needed. FTS5 is bundled in better-sqlite3's bundled SQLite.

## Architecture Patterns

### Recommended Project Structure
```
packages/daemon/src/
├── db/
│   ├── database.ts          # ADD: CREATE VIRTUAL TABLE events_fts ... USING fts5(...)
│   └── queries.ts           # ADD: searchEvents(), getAllSessions(), getSessionSummary()
└── ws/
    └── server.ts            # ADD: GET /api/search?q=, GET /api/sessions, GET /api/sessions/:id/summary

packages/ui/src/
├── router.tsx               # ADD: /history route, /compare route (or modal)
├── store/
│   └── index.ts             # ADD: historySlice (selectedCompareIds: [string, string] | null)
└── components/
    ├── layout/
    │   └── OpsLayout.tsx    # ADD: "History" nav link in sidebar header
    └── pages/
        ├── HistoryPage.tsx  # NEW: filterable session list + read-only session view
        ├── SearchBar.tsx    # NEW: global search input with debounce
        └── ComparePanel.tsx # NEW: two-column session comparison
```

### Pattern 1: FTS5 Virtual Table Creation
**What:** A virtual table that mirrors searchable text from events, approvals, and memory_notes into an FTS5 index for fast full-text lookup.
**When to use:** During DB schema setup, same place as all other CREATE TABLE IF NOT EXISTS statements in database.ts.
**Example:**
```sql
-- Source: SQLite FTS5 documentation https://www.sqlite.org/fts5.html
-- Content= tables read from real tables on query, not storing duplicates
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  content,          -- the text to search (JSON payload for events, proposed_action for approvals, content for memory notes)
  source_type,      -- 'event' | 'approval' | 'memory_note'
  source_id,        -- sequence_number / approval_id / note_id
  session_id,       -- for filtering by session
  content='',       -- external content — we manage population manually
  tokenize='unicode61'
);
```

**Population strategy:** Insert into `search_fts` alongside each insert into events/approvals/memory_notes. For existing rows at migration time, run a one-time populate from existing data. Because `content=''` is used (external content table), only the text goes into FTS5 — no data duplication.

**Alternative:** Use `content=events` to make FTS5 a content table backed by `events`. Simpler, but requires FTS5 to scan the entire events table on first query. The manual-population approach is more predictable.

### Pattern 2: FTS5 Query
**What:** Search using the FTS5 `MATCH` operator with BM25 ranking.
**When to use:** In the `searchEvents()` query function in queries.ts.
**Example:**
```typescript
// Source: SQLite FTS5 docs — MATCH syntax
export function searchAll(db: Database.Database, query: string): SearchResult[] {
  // Escape user input to prevent FTS5 syntax injection
  const sanitized = query.replace(/["]/g, '""');
  const rows = db.prepare(`
    SELECT source_type, source_id, session_id, snippet(search_fts, 0, '<b>', '</b>', '...', 20) AS snippet
    FROM search_fts
    WHERE search_fts MATCH ?
    ORDER BY rank
    LIMIT 50
  `).all(`"${sanitized}"`);
  return rows as SearchResult[];
}
```

**FTS5 MATCH syntax note:** Simple queries like `hello world` match documents containing BOTH words. Phrase queries use `"hello world"`. Prefix queries use `hello*`. User input should be sanitized (double-quote wrapping) before passing to MATCH.

### Pattern 3: getAllSessions Query (HIST-02)
**What:** A REST endpoint that returns all sessions (not just live ones) with computed summary data.
**When to use:** The browser's History page needs to list past sessions — the current WebSocket store only reflects sessions seen since connection. A REST endpoint is needed for historical sessions that may not appear in the live WS feed.

```typescript
// In queries.ts
export function getAllSessions(db: Database.Database): SessionSummary[] {
  // Derive sessions from session_start events — the events table is the source of truth
  const rows = db.prepare(`
    SELECT
      e.session_id,
      JSON_EXTRACT(e.payload, '$.provider') AS provider,
      JSON_EXTRACT(e.payload, '$.workspacePath') AS workspace_path,
      e.timestamp AS started_at,
      (SELECT timestamp FROM events
       WHERE session_id = e.session_id AND type = 'session_end'
       ORDER BY sequence_number DESC LIMIT 1) AS ended_at,
      (SELECT COUNT(*) FROM approvals WHERE session_id = e.session_id) AS approval_count,
      (SELECT COUNT(DISTINCT JSON_EXTRACT(payload, '$.filePath'))
       FROM events WHERE session_id = e.session_id AND type = 'file_change') AS files_changed
    FROM events e
    WHERE e.type = 'session_start'
    ORDER BY e.timestamp DESC
  `).all();
  return rows as SessionSummary[];
}
```

**Key insight:** The events table already has all session data. Rather than a separate sessions table, derive sessions from `session_start` events. JSON_EXTRACT works on the `payload` column because all events are stored as JSON.

### Pattern 4: Read-Only Session View (HIST-02)
**What:** Reuse existing TimelinePanel, DiffPanel, MemoryPanel in a read-only context by navigating to a history route with the same session ID.
**When to use:** When a user clicks a past session in the HistoryPage.

The existing panels already fetch their data from REST endpoints when hydrating. Opening a past session at `/history/session/:sessionId/timeline` will hydrate the timeline from `GET /api/sessions/:id/events` exactly as the live view does. No new data-fetching needed.

The only change needed: disable edit/approve actions in MemoryPanel when in read-only mode. Pass a `readOnly` boolean through React Router state or a store flag:

```typescript
// In router.tsx
{
  path: 'history/session/:sessionId',
  Component: SessionDetailPanel,  // reuse — it reads session from store
  // Before rendering, populate store with historical session from REST
}
```

**Decision:** Use a new `historyMode: boolean` flag in the Zustand store (UiSlice) so panels can check `useStore(s => s.historyMode)` and hide edit controls. This is cleaner than prop-drilling through router state.

### Pattern 5: Side-by-Side Comparison (COMP-01)
**What:** A stateless ComparePanel component that receives two session IDs and renders a two-column summary.
**When to use:** When user selects two sessions from the HistoryPage.

```typescript
// ComparePanel.tsx — pure display, no side effects
interface SessionCompareSummary {
  sessionId: string
  provider: 'claude' | 'codex'
  startedAt: string
  endedAt?: string
  runtimeMs?: number
  approvalCount: number
  filesChanged: number
  finalStatus: 'active' | 'ended' | 'error'
}

export function ComparePanel({ left, right }: { left: SessionCompareSummary; right: SessionCompareSummary }) {
  // Two-column grid
}
```

The `SessionCompareSummary` data comes from `GET /api/sessions/:id/summary` endpoint (or the getAllSessions query result). Compute runtime as `endedAt - startedAt`.

### Anti-Patterns to Avoid
- **LIKE-based search:** `WHERE payload LIKE '%query%'` is O(n) full-table scan. FTS5 MATCH is O(log n). Do not implement search with LIKE.
- **Sending all events to browser for client-side search:** 50 sessions × potentially hundreds of events each means megabytes of JSON. Server-side FTS5 is mandatory for the 2-second SLA.
- **Separate search index service:** FTS5 is already in SQLite. No Elasticsearch/MeiliSearch required.
- **Populating FTS5 with a content table on the events column:** The events.payload column is a large JSON blob. Indexing the entire blob gives noisy results. Extract just the relevant searchable text fields (proposedAction, filePath, toolName, memoryKey, workspacePath) when inserting into FTS5.
- **Creating a separate sessions table:** The events table is already the source of truth. Derive session summaries from session_start events using JSON_EXTRACT — avoid denormalization drift.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-text search | LIKE queries, custom tokenizer | SQLite FTS5 via better-sqlite3 | FTS5 handles stemming, ranking (BM25), snippet extraction, prefix queries — all bundled in SQLite |
| Search result highlighting | Custom substring matching | FTS5 `snippet()` function | Returns HTML-annotated snippets with match highlighting |
| Session list pagination | Custom JS offset/limit | SQLite `LIMIT`/`OFFSET` | SQL pagination is simpler and already in the db layer |
| Debounced search input | `setTimeout` wiring | Already available via simple `useEffect` + `useRef` pattern (no library needed at this scale) | 300ms debounce is 5 lines in React |

**Key insight:** FTS5 is the entire search engine. The complexity of this phase is UI layout, not search algorithm.

## Common Pitfalls

### Pitfall 1: FTS5 MATCH injection
**What goes wrong:** User types `"hello OR world"` which is valid FTS5 syntax — unexpected results or errors.
**Why it happens:** FTS5 MATCH expressions have their own syntax. Raw user input passed directly is a security/correctness risk.
**How to avoid:** Wrap the search query in double quotes and escape any internal double quotes: `'"' + query.replace(/"/g, '""') + '"'`. This forces the entire string to be a phrase query.
**Warning signs:** FTS5 throws "fts5: syntax error" in tests or at runtime.

### Pitfall 2: FTS5 table not populated for historical data
**What goes wrong:** The FTS5 table is created but empty for all sessions that were inserted before Phase 8.
**Why it happens:** FTS5 external content tables don't auto-populate from existing rows.
**How to avoid:** After creating the FTS5 table, run a one-time backfill in the schema migration:
```sql
INSERT OR IGNORE INTO search_fts(rowid, content, source_type, source_id, session_id)
SELECT sequence_number, payload, 'event', sequence_number, session_id FROM events;
INSERT OR IGNORE INTO search_fts(rowid, content, source_type, source_id, session_id)
SELECT rowid, proposed_action, 'approval', approval_id, session_id FROM approvals;
INSERT OR IGNORE INTO search_fts(rowid, content, source_type, source_id, session_id)
SELECT rowid, content, 'memory_note', note_id, workspace FROM memory_notes;
```
**Warning signs:** Search returns zero results for known sessions in integration tests.

### Pitfall 3: JSON_EXTRACT on payload column
**What goes wrong:** `JSON_EXTRACT(payload, '$.provider')` returns NULL for some events.
**Why it happens:** Not all event types have a `provider` field (e.g., tool_call, file_change do not).
**How to avoid:** Use `COALESCE(JSON_EXTRACT(payload, '$.provider'), 'unknown')` or filter specifically for `session_start` events when deriving sessions.
**Warning signs:** getAllSessions returns rows with null provider fields.

### Pitfall 4: Read-only view shows active session data for past sessions
**What goes wrong:** The HistoryPage navigates to a past session, but the session is not in the Zustand store (which only populates from WebSocket events since connection).
**Why it happens:** The store's `sessions` map is populated by live WS events. Past sessions that predated the current browser session are absent.
**How to avoid:** The HistoryPage must populate the store with historical session data fetched from `GET /api/sessions` before navigating. Or: the SessionDetailPanel falls back to REST fetch if the session is not in the store.
**Warning signs:** SessionDetailPanel renders "No session selected" for valid past session IDs.

### Pitfall 5: React Router state for comparison selection
**What goes wrong:** User selects two sessions for comparison and the selection is lost on navigation.
**Why it happens:** Local component state (useState) doesn't survive route changes.
**How to avoid:** Store `compareSelectionIds: string[]` in Zustand (UiSlice). Selection survives navigation.
**Warning signs:** Comparison selection resets when user navigates back to history list.

### Pitfall 6: Tailwind v4 side-by-side layout
**What goes wrong:** Two-column comparison layout breaks on narrow viewports.
**Why it happens:** Hard-coded grid columns without responsive breakpoints.
**How to avoid:** Use `grid grid-cols-2 min-w-0` with overflow guards on each column. Both columns share equal width with `flex-1 min-w-0` pattern already used in OpsLayout.
**Warning signs:** Comparison panel columns overflow the viewport horizontally.

## Code Examples

Verified patterns from official sources and project codebase:

### FTS5 Virtual Table (SQLite docs)
```sql
-- Source: https://www.sqlite.org/fts5.html section 4.4
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  content,
  source_type UNINDEXED,
  source_id UNINDEXED,
  session_id UNINDEXED,
  tokenize='unicode61'
);
-- UNINDEXED columns are stored but not indexed — reduces FTS5 index size
```

### Inserting into FTS5 alongside an event (queries.ts pattern)
```typescript
// After existing persistEvent() call pattern
export function indexForSearch(
  db: Database.Database,
  text: string,
  sourceType: 'event' | 'approval' | 'memory_note',
  sourceId: string | number,
  sessionId: string,
): void {
  db.prepare(`
    INSERT INTO search_fts(content, source_type, source_id, session_id)
    VALUES (?, ?, ?, ?)
  `).run(text, sourceType, String(sourceId), sessionId);
}
```

### Debounced search input (React pattern — project already uses useEffect)
```typescript
// SearchBar.tsx
const [query, setQuery] = useState('')
const [results, setResults] = useState<SearchResult[]>([])

useEffect(() => {
  if (!query.trim()) { setResults([]); return }
  const timer = setTimeout(() => {
    fetch(`http://localhost:3001/api/search?q=${encodeURIComponent(query)}`)
      .then(r => r.json())
      .then(setResults)
      .catch(() => setResults([]))
  }, 300)
  return () => clearTimeout(timer)
}, [query])
```

### ComparePanel two-column layout (Tailwind v4, project pattern)
```tsx
// Uses same Tailwind classes already in the project
<div className="grid grid-cols-2 h-full divide-x divide-border">
  <div className="overflow-auto p-4">
    <SessionSummaryCard summary={left} />
  </div>
  <div className="overflow-auto p-4">
    <SessionSummaryCard summary={right} />
  </div>
</div>
```

### Populate store with historical session (HIST-02 pitfall prevention)
```typescript
// In HistoryPage.tsx — before rendering past sessions
useEffect(() => {
  fetch('http://localhost:3001/api/sessions')
    .then(r => r.json())
    .then((sessions: SessionSummary[]) => {
      // Merge into store so SessionDetailPanel can find them
      useStore.getState().bulkApplySessions(sessions)
    })
    .catch(() => {})
}, [])
```
This requires adding `bulkApplySessions` to the Zustand store — similar to `bulkApplyEvents` added in Phase 5.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FTS3/FTS4 SQLite extension | FTS5 (current, recommended) | SQLite 3.9.0 (2015) | FTS5 has better BM25 ranking, better tokenization, and `snippet()` function |
| External search services (Elasticsearch, MeiliSearch) | SQLite FTS5 for local-first apps | Ongoing trend | No network dependency, no separate process, instant setup |
| React Router v6 `useOutletContext` for read-only props | React Router v7 + Zustand store flag | Project uses v7 already | Zustand flag is more testable than outlet context |

**Deprecated/outdated:**
- FTS3/FTS4: superseded by FTS5 — use `USING fts5(...)` not `USING fts4(...)`
- `content=tableName` FTS5 pattern: requires SQLite triggers to stay in sync — manual insertion (content='') is simpler for this use case

## Open Questions

1. **Which text fields to extract from event payloads for search indexing**
   - What we know: Event payloads are stored as full JSON in events.payload. Useful text fields vary by event type: `proposedAction` (approvals), `filePath` (file_change), `toolName` (tool_call), `workspacePath` (session_start), `memoryKey`/`value` (memory_write).
   - What's unclear: Whether to index full payload JSON (noisy, large) or extract specific fields.
   - Recommendation: Extract specific fields per event type when inserting into FTS5. For events, concatenate `type + ' ' + relevant_fields`. This keeps the index focused and search results meaningful.

2. **Read-only mode for MemoryPanel**
   - What we know: MemoryPanel has edit controls (save CLAUDE.md, add note, approve/reject suggestions). These should be hidden in history view.
   - What's unclear: Best mechanism — store flag vs. router state vs. prop.
   - Recommendation: Add `historyMode: boolean` to the Zustand UiSlice. MemoryPanel reads it and conditionally hides edit affordances. This avoids prop-drilling through React Router.

3. **Session comparison data source**
   - What we know: COMP-01 needs: provider, runtime, approval count, files changed, final status. Runtime requires `session_end` timestamp. Approval count is in the approvals table. Files changed is a count of distinct file_change events.
   - What's unclear: Whether to compute this in a single `GET /api/sessions/:id/summary` endpoint or return it from `GET /api/sessions` (all sessions list).
   - Recommendation: Return all summary fields from `GET /api/sessions` (the history list endpoint), computed via SQL subqueries. Then `/api/sessions/:id/summary` is a single-row variant. This avoids the UI needing two fetches per comparison.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `vitest.config.ts` (root) with `projects: ['packages/*']` |
| Quick run command | `pnpm vitest run --reporter=verbose` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HIST-01 | `searchAll()` returns results for query matching event payload | unit | `pnpm vitest run packages/daemon` | ❌ Wave 0 |
| HIST-01 | `GET /api/search?q=foo` returns JSON results within 200ms in test | integration | `pnpm vitest run packages/daemon` | ❌ Wave 0 |
| HIST-01 | SearchBar component shows results after typing | component | `pnpm vitest run packages/ui` | ❌ Wave 0 |
| HIST-02 | `getAllSessions()` returns session derived from session_start events | unit | `pnpm vitest run packages/daemon` | ❌ Wave 0 |
| HIST-02 | `GET /api/sessions` returns array of sessions with provider, status, etc. | integration | `pnpm vitest run packages/daemon` | ❌ Wave 0 |
| HIST-02 | HistoryPage renders session list and navigates to read-only view | component | `pnpm vitest run packages/ui` | ❌ Wave 0 |
| COMP-01 | ComparePanel renders two-column view with correct data for both sessions | component | `pnpm vitest run packages/ui` | ❌ Wave 0 |
| COMP-01 | `GET /api/sessions/:id/summary` returns approvalCount, filesChanged, runtimeMs | integration | `pnpm vitest run packages/daemon` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run packages/daemon` or `pnpm vitest run packages/ui` (whichever package was touched)
- **Per wave merge:** `pnpm vitest run` (full monorepo suite)
- **Phase gate:** Full suite green before marking phase complete

### Wave 0 Gaps
- [ ] `packages/daemon/src/__tests__/search.test.ts` — covers HIST-01 (FTS5 queries, search endpoint)
- [ ] `packages/daemon/src/__tests__/history-endpoints.test.ts` — covers HIST-02, COMP-01 (getAllSessions, getSessionSummary)
- [ ] `packages/ui/src/__tests__/HistoryPage.test.tsx` — covers HIST-02 (filterable list, read-only navigation)
- [ ] `packages/ui/src/__tests__/SearchBar.test.tsx` — covers HIST-01 (debounced input, result rendering)
- [ ] `packages/ui/src/__tests__/ComparePanel.test.tsx` — covers COMP-01 (two-column layout, data display)

## Sources

### Primary (HIGH confidence)
- SQLite FTS5 official documentation: https://www.sqlite.org/fts5.html — FTS5 virtual table syntax, MATCH operator, snippet() function, tokenizers
- better-sqlite3 GitHub README: https://github.com/WiseLibs/better-sqlite3 — confirms FTS5 is available via bundled SQLite (no separate extension needed)
- Project codebase (packages/daemon/src/db/database.ts) — existing schema migration pattern (CREATE TABLE IF NOT EXISTS, idempotent)
- Project codebase (packages/daemon/src/db/queries.ts) — JSON_EXTRACT pattern confirmed working with better-sqlite3 `.all()` / `.run()`
- Project codebase (packages/ui/src/components/panels/TimelinePanel.tsx) — confirmed: panels hydrate from REST on mount; reusable for read-only history view

### Secondary (MEDIUM confidence)
- SQLite JSON functions: https://www.sqlite.org/json1.html — JSON_EXTRACT syntax for querying payload column
- React Router v7 data mode patterns (confirmed from existing router.tsx in project) — lazy routes, Outlet composition

### Tertiary (LOW confidence)
- Community pattern: FTS5 `content=''` (external content) vs `content=tableName` — manual population recommended for predictable behavior; from SQLite wiki and multiple blog posts, needs validation against actual better-sqlite3 behavior in tests

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all libraries already installed and used in prior phases
- Architecture: HIGH — FTS5 is well-documented; SQL patterns are directly verifiable; UI patterns follow established project conventions
- Pitfalls: HIGH — pitfalls derived from actual project code patterns (JSON payload storage, store hydration) rather than speculation
- FTS5 external content mode: MEDIUM — manual population is the safer pattern but should be validated with a quick test before committing to it

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable libraries, 30-day estimate)
