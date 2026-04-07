# Phase 7: Memory Panel - Research

**Researched:** 2026-04-06
**Domain:** Claude Code memory file system, daemon REST extension, React UI with inline editing
**Confidence:** HIGH

---

## Summary

Phase 7 implements the `MemoryPanel.tsx` stub into a fully working memory surface. The panel must aggregate memory from two Claude Code sources — `CLAUDE.md` family files (written by the user) and auto-memory `MEMORY.md` in `~/.claude/projects/<project>/memory/` (written by Claude) — present them in a unified editable view, allow creation of new pinned notes, and surface pending agent-suggested memory updates (where `MemoryWriteEvent.suggested === true`) awaiting approval before disk write.

The event schema already has `MemoryReadEvent` and `MemoryWriteEvent` (with `suggested: boolean`) in `@cockpit/shared`. However, the Claude adapter's `hookParser.ts` does NOT currently parse these events — the `InstructionsLoaded` hook fires when a CLAUDE.md is loaded, but the current parser treats any unrecognised hook name as a generic `tool_call`. The daemon needs to be extended in two directions: (1) a new REST endpoint to read and write CLAUDE.md content via `node:fs`, and (2) parsing of `InstructionsLoaded` hook payloads into `memory_read` events and wiring of `MemoryWrite` suggestions through a new memory-approval flow.

All three data concerns — CLAUDE.md content, user notes, and suggested writes — are distinct enough to require separate daemon support. User-created notes (MEM-03) cannot rely on any provider memory file; they must be stored in a new SQLite table `memory_notes` so they survive daemon restarts. The memory panel is a pure UI consumer of two new REST endpoints and the existing WebSocket event stream.

**Primary recommendation:** Add two daemon REST endpoints (`GET/PUT /api/memory/:sessionId` and `GET/POST/DELETE /api/memory/notes`), a `memory_notes` SQLite table, and a memory-approval flow in the daemon; build `MemoryPanel.tsx` as a multi-section component consuming those endpoints and the existing `eventsSlice` for pending suggested writes.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MEM-01 | View project memory — persistent instructions, conventions, build/test commands, architecture notes, prior accepted agent learnings, normalized from CLAUDE.md and auto memory into one surface | Read `./CLAUDE.md`, `./.claude/CLAUDE.md`, `~/. claude/CLAUDE.md`, and `~/.claude/projects/<project>/memory/MEMORY.md` via daemon REST; derive workspace path from `SessionRecord.workspacePath` already in Zustand. |
| MEM-02 | Edit CLAUDE.md directly in the UI and save changes back to disk; notice when session is active | REST `PUT /api/memory/:sessionId/claude-md` writes file via `node:fs`. UI renders a textarea pre-filled with file content; save button triggers PUT. Active-session notice derived from `SessionRecord.status === 'active'` already in store. |
| MEM-03 | Create a new memory note and pin it to the project; persists across daemon restarts | New `memory_notes` SQLite table (note_id, session_id, workspace, content, pinned, created_at). REST `POST /api/memory/notes` inserts; `GET /api/memory/notes?workspace=<path>` lists. UI adds a "New Note" card with a textarea and save. |
| MEM-04 | Agent-suggested memory updates appear awaiting approval; approve writes to the appropriate file; reject discards | `MemoryWriteEvent` with `suggested: true` already in shared schema. Daemon: parse these events, hold them in a `pending_memory_suggestions` table (or in-memory map, like approvals). REST `POST /api/memory/suggestions/:id/approve` writes to disk; `DELETE /api/memory/suggestions/:id` discards. UI shows pending suggestions section derived from eventsSlice `memory_write` events with `suggested: true`. |
</phase_requirements>

---

## Standard Stack

### Core (no new npm dependencies in UI)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3 (existing) | MemoryPanel component, local editing state, textarea | Already in project |
| Zustand 5 | 5.0.11 (existing) | Read `eventsSlice.events[sessionId]` for pending memory_write events | Already in project |
| `@cockpit/shared` | workspace (existing) | `MemoryWriteEvent`, `MemoryReadEvent` types | Already in project |
| `better-sqlite3` | 12.8 (existing) | `memory_notes` table, optional `pending_memory_suggestions` table | Already in project |
| `node:fs` | built-in | Read and write CLAUDE.md files | No extra dep |
| Tailwind CSS 4 | 4.x (existing) | Panel layout, textarea, buttons, suggestion cards | Already in project |

### No New npm Dependencies

Phase 7 needs no new packages. File I/O uses `node:fs` (built-in). The UI has no rich text editor requirement — a `<textarea>` satisfies MEM-02 ("edit directly in the UI").

**Installation:**
```bash
# No new packages required
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `<textarea>` for editing | Monaco Editor | Monaco = ~2MB. MEM-02 says "edit directly"; it does not require syntax highlighting. Use textarea for v1. |
| REST endpoints for memory I/O | WebSocket messages | REST is simpler for request-response file read/write. WS is only needed for push events. |
| SQLite table for notes | Flat JSON file | SQLite is already the persistence layer; adding a second file format would diverge from established patterns (decisions log: "SQLite for v1 persistence"). |
| In-memory map for suggestions | New SQLite table | Either works. In-memory map is simpler and is the same pattern used for `pendingApprovals` in the hook server. Prefer in-memory map to avoid schema churn if v2 changes the suggestion flow. |

---

## Architecture Patterns

### Recommended File Structure

```
packages/daemon/src/
├── db/
│   └── database.ts          # ADD memory_notes table to schema
├── memory/
│   ├── memoryReader.ts      # NEW — read CLAUDE.md and MEMORY.md from workspace
│   └── memoryNotes.ts       # NEW — CRUD for memory_notes table
├── ws/
│   └── server.ts            # ADD /api/memory/* REST handlers
└── adapters/claude/
    └── hookParser.ts        # ADD InstructionsLoaded → memory_read, handle suggested writes

packages/ui/src/
├── components/panels/
│   └── MemoryPanel.tsx      # REPLACE stub — full memory panel
└── __tests__/
    └── MemoryPanel.test.tsx # NEW — RTL tests for MEM-01..04
```

No new UI packages. No changes to `eventsSlice`, `sessionsSlice`, or `store/index.ts`.

### Pattern 1: Multi-Section Memory Panel

The panel has four visually distinct sections rendered top-to-bottom:

1. **CLAUDE.md editor** — fetched from `GET /api/memory/:sessionId/claude-md`, rendered in a `<textarea>`, saved via `PUT`.
2. **Auto memory (read-only)** — fetched from `GET /api/memory/:sessionId/auto-memory`, rendered as formatted `<pre>` or simple `<div>` blocks.
3. **Pinned notes** — fetched from `GET /api/memory/notes?workspace=<path>`, each with an edit/delete control; "New Note" button opens inline creation form.
4. **Pending suggestions** — derived from `eventsSlice.events[sessionId]` filtered to `memory_write` events with `suggested === true`; each shows a card with approve/reject buttons that POST/DELETE to daemon.

```typescript
// Source: pattern established in DiffPanel.tsx (Phase 6)
function MemoryPanel() {
  const { sessionId } = useParams()
  const events = useStore((s) => getSessionEvents(s, sessionId ?? ''))
  // ... fetch CLAUDE.md content, notes
  // ... filter pending suggestions from events
}
```

### Pattern 2: Daemon REST Endpoint Registration

Following the pattern in `ws/server.ts` where `eventsMatch` is registered before `POST /api/sessions`, new memory endpoints should be registered in URL-specificity order (most specific first):

```typescript
// Source: ws/server.ts existing pattern
const claudeMdMatch = req.url?.match(/^\/api\/memory\/([^/]+)\/claude-md$/)
const autoMemoryMatch = req.url?.match(/^\/api\/memory\/([^/]+)\/auto-memory$/)
const notesMatch = req.url?.match(/^\/api\/memory\/notes/)
const suggestMatch = req.url?.match(/^\/api\/memory\/suggestions\/([^/]+)\/(approve|reject)$/)
```

### Pattern 3: File I/O in Daemon (memoryReader.ts)

Claude Code memory file resolution order (from official docs, HIGH confidence):
1. `<workspacePath>/CLAUDE.md` — project instructions
2. `<workspacePath>/.claude/CLAUDE.md` — alternative project location
3. `~/.claude/CLAUDE.md` — user-level instructions
4. `~/.claude/projects/<project>/memory/MEMORY.md` — auto memory

The `<project>` path for auto memory is derived from the git repository root. For the daemon to compute this without shelling out to git, it can use the `workspacePath` directly as a fallback (Claude Code itself falls back to project root outside git repos).

```typescript
// memoryReader.ts — resolve paths, read files safely
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export function resolveClaudeMdPath(workspacePath: string): string {
  // Try workspacePath/CLAUDE.md first, then workspacePath/.claude/CLAUDE.md
  const primary = path.join(workspacePath, 'CLAUDE.md');
  return fs.existsSync(primary) ? primary : path.join(workspacePath, '.claude', 'CLAUDE.md');
}

export function resolveAutoMemoryPath(workspacePath: string): string {
  // ~/.claude/projects/<encoded-workspace-path>/memory/MEMORY.md
  const projectKey = workspacePath.replace(/\//g, '-').replace(/^-/, '');
  return path.join(os.homedir(), '.claude', 'projects', projectKey, 'memory', 'MEMORY.md');
}

export function readFileSafe(filePath: string): string | null {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return null; }
}

export function writeFileSafe(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}
```

### Pattern 4: memory_notes SQLite Table

```sql
CREATE TABLE IF NOT EXISTS memory_notes (
  note_id    TEXT PRIMARY KEY,
  workspace  TEXT NOT NULL,
  content    TEXT NOT NULL,
  pinned     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_notes_workspace
  ON memory_notes (workspace);
```

Added to the existing `db.exec()` block in `database.ts`, following the established pattern. The `workspace` column matches the session's `workspacePath`, enabling cross-session note lookup for a project.

### Pattern 5: Active-Session Warning for MEM-02

The UI reads `sessions[sessionId].status` from the Zustand store (already populated). If `status === 'active'`, show a notice: "Changes take effect on the next session — a session is currently running."

```typescript
// In MemoryPanel.tsx
const session = useStore((s) => s.sessions[sessionId ?? ''])
const showActiveWarning = session?.status === 'active'
```

### Anti-Patterns to Avoid

- **Polling for memory file changes:** Do not poll the filesystem from the UI. Only read on panel mount and after user save. Live agent memory writes are surfaced via the `memory_write` WebSocket events already in the event stream.
- **Writing MEMORY.md on approve (MEM-04):** Approved suggestions should be written to the auto memory file at `~/.claude/projects/<project>/memory/MEMORY.md`, NOT to `CLAUDE.md`. They are agent learnings, not user instructions.
- **Deriving workspace from session in UI:** The UI should send `sessionId` to the daemon and let the daemon look up `workspacePath` from its session records. Do not expose raw file paths to the browser.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File read/write with error handling | Custom fs wrapper | `node:fs` + try/catch pattern (as in `memoryReader.ts`) | One pattern, tested pattern covers ENOENT, EACCES |
| Concurrent write safety | Custom locking | `better-sqlite3` synchronous writes + `node:fs` atomic writes (writeFileSync) | Single-process daemon; no multi-writer race possible |
| Rich text CLAUDE.md editing | Monaco or CodeMirror | `<textarea>` | MEM-02 requires editing, not syntax highlighting; textarea covers it |

**Key insight:** Memory files are plain markdown. The edit requirement (MEM-02) is satisfied by a plain `<textarea>` — no editor library is needed.

---

## Common Pitfalls

### Pitfall 1: Auto-Memory Path Encoding

**What goes wrong:** The auto memory path `~/.claude/projects/<project>/memory/MEMORY.md` uses a specific encoding of `workspacePath` to the `<project>` segment. If the encoding does not match Claude Code's own encoding, the file will not be found.

**Why it happens:** Claude Code encodes the workspace path into the project directory name, but the exact encoding algorithm (separator, leading slash removal, etc.) is not officially documented at HIGH confidence. The `memoryReader.ts` pattern above uses `-` as path separator after stripping the leading `/`, which matches community-observed behaviour but should be validated at planning time by checking what directories actually exist in `~/.claude/projects/` for a known workspace.

**How to avoid:** In `memoryReader.ts`, if the constructed MEMORY.md path doesn't exist, fall back gracefully (`readFileSafe` returns null). The UI renders "No auto memory found" rather than crashing.

**Warning signs:** Auto memory section always empty even when `claude --version` is ≥ 2.1.59 and auto memory is enabled.

### Pitfall 2: Suggested Write Race with Hook Server

**What goes wrong:** A `memory_write` event with `suggested: true` arrives via WebSocket, the user approves, and the approve REST endpoint writes to disk — but if Claude Code is also writing to the same file concurrently, the writes race.

**Why it happens:** Claude Code owns the auto memory files; cockpit is a side-channel observer. A suggested write that Claude Code decides to commit itself (without waiting for approval) would overwrite cockpit's approved write.

**How to avoid:** This is a v1 acceptable limitation. Document it as known behaviour. The memory panel is a review surface; in practice, Claude Code only writes memory at session end (not continuously), and the user approval flow takes seconds. Full locking requires cooperation from Claude Code's API.

### Pitfall 3: Infinite Re-render from Events Selector

**What goes wrong:** `useStore((s) => getSessionEvents(s, sessionId))` returns a new array every render if the selector is not stabilized, causing a tight re-render loop.

**Why it happens:** Established pitfall from Phase 5 — documented in STATE.md decision: "EMPTY_EVENTS exported from eventsSlice ensures stable selector reference."

**How to avoid:** Use `EMPTY_EVENTS` from `eventsSlice.ts` as the fallback. Do not use inline `[]` as default. This pattern is already proven in `TimelinePanel.tsx` and `DiffPanel.tsx`.

### Pitfall 4: Missing CLAUDE.md File

**What goes wrong:** `GET /api/memory/:sessionId/claude-md` throws or returns 500 when `CLAUDE.md` does not exist in the workspace.

**Why it happens:** `fs.readFileSync` throws `ENOENT` for missing files.

**How to avoid:** `readFileSafe` returns `null`; the endpoint returns `{ content: null, path: null }` with HTTP 200. The UI renders a "No CLAUDE.md found — create one?" prompt with a button that POSTs empty content to create it.

### Pitfall 5: CORS / Method not registered

**What goes wrong:** `PUT /api/memory/:sessionId/claude-md` returns 404 because the existing `httpServer` handler does not register PUT.

**Why it happens:** The current `server.ts` only registers GET and POST in `Access-Control-Allow-Methods`.

**How to avoid:** Add `PUT, DELETE` to the CORS header. Register PUT handler in the request handler before the 404 fallthrough.

---

## Code Examples

Verified patterns from existing codebase:

### Reading Events (Established Pattern from eventsSlice)
```typescript
// Source: packages/ui/src/store/eventsSlice.ts
import { EMPTY_EVENTS } from '../../store/eventsSlice.js'
const events = useStore((s) => s.events[sessionId ?? ''] ?? EMPTY_EVENTS)
const pendingSuggestions = events.filter(
  (e) => e.type === 'memory_write' && (e as MemoryWriteEvent).suggested === true
)
```

### REST Endpoint Registration (Established Pattern from ws/server.ts)
```typescript
// Source: packages/daemon/src/ws/server.ts — existing pattern
const claudeMdMatch = req.method === 'GET' &&
  req.url?.match(/^\/api\/memory\/([^/]+)\/claude-md$/)
if (claudeMdMatch) {
  const sessionId = claudeMdMatch[1]!
  // look up workspacePath from sessions table or codex_sessions
  // read CLAUDE.md, return { content, path }
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ content, path: resolvedPath }))
  return
}
```

### SQLite Table Addition (Established Pattern from database.ts)
```typescript
// Source: packages/daemon/src/db/database.ts — existing db.exec() block
db.exec(`
  CREATE TABLE IF NOT EXISTS memory_notes (
    note_id    TEXT PRIMARY KEY,
    workspace  TEXT NOT NULL,
    content    TEXT NOT NULL,
    pinned     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_memory_notes_workspace
    ON memory_notes (workspace);
`);
```

### MemoryWriteEvent Schema (Already Defined)
```typescript
// Source: packages/shared/src/events.ts
export const MemoryWriteEvent = BaseEvent.extend({
  type: z.literal('memory_write'),
  memoryKey: z.string(),
  value: z.string(),
  suggested: z.boolean().default(false),
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CLAUDE.md only for memory | CLAUDE.md + auto memory (MEMORY.md) | Claude Code v2.1.59 (2025) | Panel must read both files |
| Manual memory management | Claude writes auto memory autonomously | 2025 | MEM-04 (suggested writes) becomes meaningful |
| Memory as static config | Memory as living notes Claude edits | 2025 | Read-write UI is the correct model, not read-only |
| Single CLAUDE.md | Multi-scope: project, user, local, managed | Ongoing | Panel should show scope label per section |

**Deprecated/outdated:**
- `AGENTS.md` is NOT read by Claude Code — the UI must show `CLAUDE.md`. Claude docs explicitly state this.

---

## Open Questions

1. **Auto-memory path encoding algorithm**
   - What we know: Path is at `~/.claude/projects/<project>/memory/MEMORY.md`; `<project>` is derived from the git repo root
   - What's unclear: The exact encoding of slashes and special chars in `<project>`. Community examples show `-` replacing `/` but this is LOW confidence
   - Recommendation: At plan time, validate by checking actual `~/.claude/projects/` contents. `readFileSafe` returning null is the safe fallback; never crash on missing file.

2. **InstructionsLoaded hook integration**
   - What we know: The `InstructionsLoaded` hook fires when CLAUDE.md loads. The shared schema has `MemoryReadEvent { type: 'memory_read', memoryKey: string }`. The hookParser does not currently parse `InstructionsLoaded`.
   - What's unclear: Whether MEM-01 requires this hook to be parsed, or whether reading the file via REST is sufficient (REST is simpler and covers the MEM-01 viewing requirement without requiring hook changes).
   - Recommendation: REST is sufficient for MEM-01. Skip `InstructionsLoaded` hook parsing in Phase 7; `memory_read` events from the timeline are informational only and already handled in `TimelinePanel.tsx`. Only add hook parsing if the planner determines timeline `memory_read` display is required for MEM-01.

3. **Workspace lookup for notes (MEM-03)**
   - What we know: `SessionRecord.workspacePath` is in the Zustand store. The daemon has `codex_sessions.workspace` in SQLite.
   - What's unclear: How to look up `workspacePath` for a `sessionId` at the daemon level when handling `GET /api/memory/notes`. The daemon has no `sessions` table — `workspacePath` comes from the `session_start` event.
   - Recommendation: Add a `sessions` table (or query `events` for the first `session_start` event for that sessionId to extract `workspacePath` from its payload). The simplest path: `SELECT payload FROM events WHERE session_id = ? AND type = 'session_start' LIMIT 1` and extract `payload.workspacePath`.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (existing in both packages) |
| Config file | `vitest.config.ts` at root (`projects: ['packages/*']`) |
| Quick run command | `pnpm vitest run --project packages/ui` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MEM-01 | MemoryPanel renders CLAUDE.md content from fetch response | unit (RTL) | `pnpm vitest run --project packages/ui` | ❌ Wave 0 |
| MEM-01 | MemoryPanel renders auto memory content section | unit (RTL) | `pnpm vitest run --project packages/ui` | ❌ Wave 0 |
| MEM-02 | Textarea pre-filled with CLAUDE.md content; save triggers PUT | unit (RTL) | `pnpm vitest run --project packages/ui` | ❌ Wave 0 |
| MEM-02 | Active-session warning shown when session.status === 'active' | unit (RTL) | `pnpm vitest run --project packages/ui` | ❌ Wave 0 |
| MEM-03 | Notes list rendered from GET /api/memory/notes response | unit (RTL) | `pnpm vitest run --project packages/ui` | ❌ Wave 0 |
| MEM-03 | New note creation form submits POST | unit (RTL) | `pnpm vitest run --project packages/ui` | ❌ Wave 0 |
| MEM-04 | Pending suggestion cards appear for memory_write events with suggested=true | unit (RTL) | `pnpm vitest run --project packages/ui` | ❌ Wave 0 |
| MEM-04 | Approve button triggers POST /api/memory/suggestions/:id/approve | unit (RTL) | `pnpm vitest run --project packages/ui` | ❌ Wave 0 |
| MEM-04 | Reject button triggers DELETE /api/memory/suggestions/:id | unit (RTL) | `pnpm vitest run --project packages/ui` | ❌ Wave 0 |
| MEM-01 | memoryReader.resolveClaudeMdPath returns correct path | unit (daemon) | `pnpm vitest run --project packages/daemon` | ❌ Wave 0 |
| MEM-01 | memoryReader.readFileSafe returns null for missing file | unit (daemon) | `pnpm vitest run --project packages/daemon` | ❌ Wave 0 |
| MEM-03 | memory_notes CRUD queries insert/select/delete correctly | unit (daemon) | `pnpm vitest run --project packages/daemon` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm vitest run --project packages/ui`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/ui/src/__tests__/MemoryPanel.test.tsx` — covers MEM-01 through MEM-04 (RTL)
- [ ] `packages/daemon/src/__tests__/memory-reader.test.ts` — covers memoryReader helpers
- [ ] `packages/daemon/src/__tests__/memory-notes.test.ts` — covers memory_notes CRUD
- [ ] `packages/daemon/src/memory/` directory — new module, no existing files

---

## Sources

### Primary (HIGH confidence)
- Official Claude Code hooks documentation (https://code.claude.com/docs/en/hooks) — InstructionsLoaded event, all hook event names, field schemas
- Official Claude Code memory documentation (https://code.claude.com/docs/en/memory) — CLAUDE.md scope table, auto memory storage location, MEMORY.md format, 200-line limit
- `packages/shared/src/events.ts` — existing MemoryReadEvent, MemoryWriteEvent schemas
- `packages/daemon/src/db/database.ts` — existing schema pattern, table creation idiom
- `packages/daemon/src/ws/server.ts` — REST endpoint registration pattern
- `packages/ui/src/store/eventsSlice.ts` — EMPTY_EVENTS pattern, selector stability

### Secondary (MEDIUM confidence)
- WebFetch of https://deepwiki.com/severity1/claude-code-auto-memory — confirms PostToolUse memory hook does NOT emit structured events; auto memory is file-based
- Community articles confirming auto memory storage format (`~/.claude/projects/<project>/memory/MEMORY.md`)

### Tertiary (LOW confidence)
- Auto-memory `<project>` path encoding algorithm (slash-to-dash replacement) — observed in community examples, not in official docs; needs validation at planning time

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all existing libraries confirmed in package.json
- Architecture patterns: HIGH — REST + filesystem + SQLite follows exact same patterns as Phases 2/5/6
- Memory file locations: HIGH — from official Claude Code memory docs (fetched)
- Auto-memory path encoding: LOW — community-observed only; official docs do not specify the algorithm
- Pitfalls: HIGH — EMPTY_EVENTS and CORS issues are from existing project history; file-not-found and concurrent writes are standard filesystem pitfalls

**Research date:** 2026-04-06
**Valid until:** 2026-05-06 (Claude Code memory system is stable; auto memory API only changes on major Claude Code releases)
