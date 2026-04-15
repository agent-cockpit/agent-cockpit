# Phase 1: Daemon Core - Research

**Researched:** 2026-04-05
**Domain:** Node.js TypeScript daemon — SQLite persistence, WebSocket server, monorepo scaffolding, normalized event schema
**Confidence:** HIGH

---

## Summary

Phase 1 establishes the entire foundation of Agent Mission Control. The daemon is a standalone Node.js TypeScript process that exposes a WebSocket server to the browser and writes every event it receives to a local SQLite database. No browser UI exists yet — the only consumer is a test harness. The three requirements (DAEMON-01, DAEMON-02, DAEMON-03) map cleanly onto three modules: the shared event schema in `packages/shared`, the SQLite persistence layer in `packages/daemon`, and the WebSocket server with sequence-based catch-up also in `packages/daemon`.

The monorepo uses pnpm workspaces. The stack is: Zod (schema + runtime validation), better-sqlite3 (synchronous SQLite with WAL mode), ws (WebSocket server), tsx (TypeScript execution for development), and Vitest (testing). All libraries are mature, well-typed, and actively maintained as of April 2026.

The sequence-based catch-up protocol is the subtlest piece: the SQLite `sequence_number` column IS the authoritative sequence, allocated by the DB's `INTEGER PRIMARY KEY` rowid on insert. On WebSocket reconnect the client sends `lastSeenSequence`; the daemon queries `WHERE sequence_number > ?` ordered ascending and flushes the result set before switching to live broadcast. This keeps the reconnect path simple and makes event ordering durable across daemon restarts with zero extra state.

**Primary recommendation:** Use `INTEGER PRIMARY KEY` (NOT AUTOINCREMENT) for `sequence_number` — SQLite guarantees rowid monotonicity without the AUTOINCREMENT overhead table. WAL mode + `wal_checkpoint(RESTART)` on interval covers durability. Use ws's `wss.clients` set for live broadcast and a single `db.prepare(...).all(...)` for catch-up replay.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DAEMON-01 | Normalized event schema with `schemaVersion` and `sequenceNumber` in `packages/shared`, importable by daemon and test harness without any adapter | Zod discriminated union schema pattern; pnpm workspace:* protocol for cross-package imports |
| DAEMON-02 | SQLite persistence with WAL mode enabled and checkpoint scheduling configured at boot | better-sqlite3 v12.8.0; `db.pragma('journal_mode = WAL')`; `setInterval` checkpoint pattern from official docs |
| DAEMON-03 | WebSocket server with sequence-based catch-up protocol; browser reconnects with `lastSeenSequence` and receives only missed events in order | ws v8.18.3; SQLite `WHERE sequence_number > ?` query pattern; connection `upgrade` event with query param parsing |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | 12.8.0 | Synchronous SQLite for Node.js | Fastest Node.js SQLite binding; synchronous API fits daemon's serial event processing; built-in WAL, transactions, prepared statements |
| ws | 8.18.3 | WebSocket server | De facto Node.js WebSocket library; no dependencies; thoroughly tested; exposes `clients` set for broadcast |
| zod | 4.x (^4.0.0) | Runtime schema validation + TypeScript type inference | Schema-first event definition generates TypeScript types; discriminated union enables exhaustive event handling; Zod v4 is current as of mid-2025 |
| tsx | latest | TypeScript execution for development (`tsx watch`) | esbuild-based, fast, zero config; replaces ts-node; built-in watch mode |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/better-sqlite3 | 7.6.13 | TypeScript types for better-sqlite3 | Always; not bundled with the main package |
| @types/ws | 8.18.1 | TypeScript types for ws | Always; not bundled with the main package |
| vitest | latest (^3.x) | Test runner | All unit and integration tests; native TypeScript support; projects config for monorepo |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| better-sqlite3 | node-sqlite3 (async) or Prisma | Async SQLite adds no value for a serial event log and introduces Promise chains where none are needed; Prisma is overkill for a schema-less event store |
| ws | socket.io | socket.io bundles rooms, namespaces, reconnect logic, and polling fallback — all unnecessary overhead; custom catch-up is 20 lines of SQL |
| zod | TypeScript interfaces only | Runtime validation is required to reject malformed events from adapters; plain interfaces provide zero runtime protection |
| tsx | ts-node or native Node.js `--experimental-strip-types` | ts-node is slower and requires more config; native stripping (Node 22.6+) lacks source maps and watch mode |

**Installation:**
```bash
pnpm add better-sqlite3 ws zod
pnpm add -D @types/better-sqlite3 @types/ws tsx vitest typescript
```

---

## Architecture Patterns

### Recommended Project Structure

```
agent-cockpit/
├── pnpm-workspace.yaml         # packages: ['packages/*']
├── package.json                # root — scripts, devDependencies (typescript, vitest, tsx)
├── tsconfig.base.json          # shared compiler options
├── vitest.config.ts            # root — test: { projects: ['packages/*'] }
└── packages/
    ├── shared/                 # DAEMON-01: NormalizedEvent schema
    │   ├── package.json        # name: "@cockpit/shared"
    │   ├── tsconfig.json
    │   └── src/
    │       ├── events.ts       # Zod schemas + inferred types
    │       └── index.ts        # re-exports
    └── daemon/                 # DAEMON-02, DAEMON-03: persistence + WebSocket
        ├── package.json        # name: "@cockpit/daemon"; dep: "workspace:*" on shared
        ├── tsconfig.json
        └── src/
            ├── db/
            │   ├── database.ts     # open, WAL pragma, migrations, checkpoint interval
            │   └── queries.ts      # prepared statements: insertEvent, getEventsSince
            ├── ws/
            │   ├── server.ts       # WebSocketServer creation, broadcast helper
            │   └── handlers.ts     # connection handler, catch-up replay on connect
            ├── eventBus.ts         # in-process EventEmitter — adapters emit here
            └── index.ts            # wires DB + WS + eventBus, handles SIGTERM/SIGINT
```

### Pattern 1: Zod Discriminated Union Event Schema (DAEMON-01)

**What:** Define all event types as a Zod discriminated union keyed on `type`. Export the union type as `NormalizedEvent`. Every field the daemon and browser need is validated at the adapter boundary before anything is written to SQLite.

**When to use:** Always — every event enters the system through this schema.

```typescript
// Source: https://zod.dev/api (discriminatedUnion)
// packages/shared/src/events.ts

import { z } from 'zod';

const BaseEvent = z.object({
  schemaVersion: z.literal(1),
  sequenceNumber: z.number().int().positive().optional(), // assigned by DB on insert
  sessionId: z.string().uuid(),
  timestamp: z.string().datetime(),
});

export const ToolCallEvent = BaseEvent.extend({
  type: z.literal('tool_call'),
  toolName: z.string(),
  input: z.unknown(),
});

export const SessionStartEvent = BaseEvent.extend({
  type: z.literal('session_start'),
  provider: z.enum(['claude', 'codex']),
  workspacePath: z.string(),
});

// ... additional event types

export const NormalizedEventSchema = z.discriminatedUnion('type', [
  ToolCallEvent,
  SessionStartEvent,
  // ... all event types
]);

export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;
```

**Key insight:** `sequenceNumber` is optional on input — it is assigned by SQLite's INTEGER PRIMARY KEY rowid on insert and read back after the insert. Adapters never provide it.

### Pattern 2: SQLite WAL Mode + Checkpoint Scheduling (DAEMON-02)

**What:** Open the database synchronously, run WAL pragma immediately, set up a checkpoint interval that fires in the background and does not block the event loop.

**When to use:** At daemon boot, before accepting any events.

```typescript
// Source: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md
// packages/daemon/src/db/database.ts

import Database from 'better-sqlite3';
import * as fs from 'node:fs';

export function openDatabase(path: string): Database.Database {
  const db = new Database(path);

  // WAL mode is required by DAEMON-02
  db.pragma('journal_mode = WAL');

  // Recommended production settings
  db.pragma('synchronous = NORMAL'); // default with WAL; acceptable durability
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Schema migrations (idempotent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      sequence_number INTEGER PRIMARY KEY,  -- rowid alias; monotonically increasing
      session_id      TEXT NOT NULL,
      type            TEXT NOT NULL,
      schema_version  INTEGER NOT NULL DEFAULT 1,
      payload         TEXT NOT NULL,        -- JSON blob of the full NormalizedEvent
      timestamp       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_session
      ON events (session_id, sequence_number);
  `);

  // Checkpoint scheduling: fires every 10s, non-blocking (.unref())
  const walPath = `${path}-wal`;
  const checkpointInterval = setInterval(() => {
    try {
      const stat = fs.statSync(walPath);
      if (stat.size > 10 * 1024 * 1024) { // 10 MB threshold
        db.pragma('wal_checkpoint(RESTART)');
      }
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }, 10_000);
  checkpointInterval.unref(); // do not keep process alive

  return db;
}
```

### Pattern 3: WebSocket Sequence Catch-Up on Reconnect (DAEMON-03)

**What:** On each new WebSocket connection, parse `lastSeenSequence` from the URL query string. If present, query all events with `sequence_number > lastSeenSequence` and send them in order before the client enters the live stream.

**When to use:** Every connection — first connection sends nothing (or all events if `lastSeenSequence = 0`); reconnects replay only the gap.

```typescript
// Source: https://github.com/websockets/ws (connection example)
// packages/daemon/src/ws/handlers.ts

import { WebSocket, WebSocketServer } from 'ws';
import type Database from 'better-sqlite3';
import { IncomingMessage } from 'node:http';

export function handleConnection(
  ws: WebSocket,
  req: IncomingMessage,
  db: Database.Database,
): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const lastSeenSequence = parseInt(url.searchParams.get('lastSeenSequence') ?? '0', 10);

  // Replay missed events
  const missed = db.prepare(
    'SELECT payload FROM events WHERE sequence_number > ? ORDER BY sequence_number ASC'
  ).all(lastSeenSequence) as Array<{ payload: string }>;

  for (const row of missed) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(row.payload);
    }
  }

  // Client is now caught up — live events arrive via eventBus subscription
  ws.on('message', (data) => {
    // Browser sends approval decisions; Phase 1 ignores them
  });

  ws.on('close', () => {
    // cleanup if needed
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
}

// Broadcast helper for live events
export function broadcast(wss: WebSocketServer, payload: string): void {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}
```

### Pattern 4: Graceful Shutdown

**What:** Handle SIGTERM and SIGINT to close WebSocket connections, flush WAL, and close the database before process exit.

```typescript
// packages/daemon/src/index.ts

function shutdown(db: Database.Database, wss: WebSocketServer): void {
  wss.close(() => {
    db.pragma('wal_checkpoint(TRUNCATE)'); // flush WAL on clean exit
    db.close();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown(db, wss));
process.on('SIGINT',  () => shutdown(db, wss));
```

### Anti-Patterns to Avoid

- **Using AUTOINCREMENT keyword:** SQLite's `INTEGER PRIMARY KEY` already guarantees monotonically increasing rowids. `AUTOINCREMENT` adds an extra system table lookup and CPU overhead with no benefit for a non-deletion event log. Use `INTEGER PRIMARY KEY` without the keyword.
- **In-memory sequence counter:** Do not maintain a separate in-process sequence counter. The DB rowid IS the sequence. Reading `lastID` after `.run()` on better-sqlite3 gives the assigned rowid with zero extra queries.
- **Buffering events in memory for catch-up:** SQLite IS the durable buffer. Avoid a separate in-memory ring buffer — it adds complexity and loses state on crash. Always query from SQLite.
- **Async SQLite:** better-sqlite3's synchronous API is intentional. Do not wrap calls in `Promise` wrappers or use the async sqlite3 package. The serial synchronous design prevents write ordering bugs.
- **Zod v3 discriminated union:** If zod v3 is somehow installed, discriminated unions had limitations with nested unions. Use Zod 4.x exclusively.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Runtime event validation | Custom type guards | Zod NormalizedEventSchema.parse() | Zod handles all edge cases: missing fields, wrong types, extra fields (strip mode), and generates TypeScript types for free |
| SQLite connection management | Custom pool / retry logic | better-sqlite3 single connection | SQLite WAL handles single-writer concurrency; connection pools add bugs without benefit |
| WebSocket reconnect on client | Custom retry loop | Standard browser WebSocket with exponential backoff | The catch-up protocol lives on the server (SQLite query); client only needs to re-open the socket with `lastSeenSequence` in the URL |
| WAL file management | Custom fsync / truncate scheduling | `db.pragma('wal_checkpoint(RESTART)')` interval | better-sqlite3 pragma wraps SQLite's native checkpoint correctly |
| Schema migrations | ORMs, migration runners | Plain `db.exec(CREATE TABLE IF NOT EXISTS ...)` | Phase 1 has one table; a migration runner adds config and dependency overhead that is not justified until the schema is stable |

---

## Common Pitfalls

### Pitfall 1: `lastSeenSequence` Off-By-One
**What goes wrong:** Client receives event N, disconnects. On reconnect sends `lastSeenSequence = N`. Server queries `WHERE sequence_number > N` — correct. But if the client mistakenly sends `lastSeenSequence = N-1`, it re-receives event N (duplicate). If it sends `lastSeenSequence = N+1`, it skips event N+1 if that was the last one buffered (gap).
**Why it happens:** Confusion between "last sequence I saw" vs "first sequence I want next."
**How to avoid:** Define the protocol precisely in code comments: `lastSeenSequence` is inclusive of the last received event. Query is strictly `> lastSeenSequence`. Test with `lastSeenSequence = 0` (first connect, no events missed) and `lastSeenSequence = MAX` (reconnect, nothing missed).
**Warning signs:** Integration test shows duplicate events on reconnect.

### Pitfall 2: WAL Mode Not Confirmed Active
**What goes wrong:** The daemon starts, the `db.pragma('journal_mode = WAL')` call succeeds syntactically, but something (network filesystem, read-only mount, existing open connection from another process) silently falls back to DELETE mode.
**Why it happens:** SQLite `journal_mode` pragma returns the current mode string — it does not throw on failure to switch.
**How to avoid:** Assert the return value: `const mode = db.pragma('journal_mode = WAL', { simple: true }); assert(mode === 'wal', ...)`. DAEMON-02 success criteria explicitly requires WAL confirmation.
**Warning signs:** `PRAGMA journal_mode` returns `'delete'` instead of `'wal'` after boot.

### Pitfall 3: Broadcast Race on Catch-Up + Live Events
**What goes wrong:** A reconnecting client receives catch-up events from SQLite, but while the replay loop is running, a new live event is broadcast. The client gets the live event before the catch-up is complete, breaking ordering.
**Why it happens:** Catch-up replay and live broadcast are not synchronized.
**How to avoid:** Complete the full catch-up replay before subscribing the client to live broadcast. Since better-sqlite3 is synchronous and Node.js is single-threaded, the `for` loop over `missed` runs atomically before any new event can be emitted in the same tick. Do not introduce async gaps (no `await` or `setImmediate`) inside the replay loop.
**Warning signs:** Browser shows events out of sequence after reconnect.

### Pitfall 4: Daemon Keeps Process Alive After `ws.close()`
**What goes wrong:** The WebSocket server's `close()` is called but the process does not exit because open client connections are still alive.
**Why it happens:** `wss.close()` stops accepting new connections but does not terminate existing ones. The process stays alive as long as any socket is open.
**How to avoid:** Before calling `wss.close()`, iterate `wss.clients` and call `client.terminate()` on each. Then close the DB.
**Warning signs:** `Ctrl+C` does not exit the daemon process cleanly.

### Pitfall 5: pnpm workspace:* Import Fails at Runtime
**What goes wrong:** `import { NormalizedEventSchema } from '@cockpit/shared'` works for type checking but throws `MODULE_NOT_FOUND` at runtime.
**Why it happens:** The `exports` field in `packages/shared/package.json` is missing or points to `dist/` which has not been built. With `tsx`, source is executed directly, so `exports` must point to the `.ts` source file or tsconfig `paths` must map the package name.
**How to avoid:** In development (tsx), add a `main` / `exports` in `packages/shared/package.json` pointing to `./src/index.ts`. For production builds, add a build step that compiles to `dist/` and update `exports` to `./dist/index.js`.
**Warning signs:** `Error: Cannot find module '@cockpit/shared'` at daemon startup.

---

## Code Examples

Verified patterns from official sources:

### Insert Event and Read Back Sequence Number
```typescript
// Source: https://github.com/WiseLibs/better-sqlite3 (README)
const insertEvent = db.prepare(`
  INSERT INTO events (session_id, type, schema_version, payload, timestamp)
  VALUES (@sessionId, @type, @schemaVersion, @payload, @timestamp)
`);

function persistEvent(event: NormalizedEvent): NormalizedEvent & { sequenceNumber: number } {
  const result = insertEvent.run({
    sessionId: event.sessionId,
    type: event.type,
    schemaVersion: event.schemaVersion,
    payload: JSON.stringify(event),
    timestamp: event.timestamp,
  });
  return { ...event, sequenceNumber: result.lastInsertRowid as number };
}
```

### WebSocket Server with HTTP Upgrade (production pattern)
```typescript
// Source: https://github.com/websockets/ws (external HTTP server example)
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const httpServer = createServer();
const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws, req) => {
  handleConnection(ws, req, db);
});

httpServer.listen(PORT);
```

### Zod Safe Parse for Adapter Boundary
```typescript
// Source: https://zod.dev/api (safeParse)
function ingestEvent(raw: unknown): void {
  const result = NormalizedEventSchema.safeParse(raw);
  if (!result.success) {
    console.error('Invalid event rejected:', result.error.flatten());
    return; // do not persist or broadcast
  }
  const event = persistEvent(result.data);
  broadcast(wss, JSON.stringify(event));
}
```

### Vitest Root Config for Monorepo
```typescript
// Source: https://vitest.dev/guide/projects
// vitest.config.ts (root)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*'],
  },
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ts-node for TypeScript execution | tsx (esbuild-based) | 2023–2024 | Faster startup, native watch mode, less config |
| Vitest `workspace` config file | `test.projects` in root `vitest.config.ts` | Vitest 3.2 (2025) | `vitest.workspace.ts` is deprecated; use `projects` option instead |
| sqlite3 (async callback) | better-sqlite3 (sync) | Mainstream since ~2020 | Synchronous API eliminates callback/Promise chains for serial write workloads |
| Zod v3 | Zod v4 (released mid-2025) | 2025 | Better discriminated union composition, JSON Schema conversion, performance improvements |

**Deprecated/outdated:**
- `vitest.workspace.ts` separate file: deprecated since Vitest 3.2 — use `test.projects` in root config
- `ts-node`: still maintained but tsx is the modern default for new projects
- SQLite `AUTOINCREMENT` keyword: officially discouraged by SQLite docs for append-only tables; plain `INTEGER PRIMARY KEY` is sufficient and faster

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (^3.x) |
| Config file | `vitest.config.ts` at repo root (Wave 0 gap — does not yet exist) |
| Quick run command | `pnpm --filter @cockpit/daemon test run` |
| Full suite command | `pnpm test run` (all packages) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DAEMON-01 | `NormalizedEventSchema` validates a valid event and rejects an invalid one | unit | `pnpm --filter @cockpit/shared test run` | Wave 0 |
| DAEMON-01 | `NormalizedEvent` type is importable in daemon package without circular dependency | unit (import smoke test) | `pnpm --filter @cockpit/daemon test run` | Wave 0 |
| DAEMON-02 | `openDatabase()` sets WAL mode and asserts return value is `'wal'` | unit | `pnpm --filter @cockpit/daemon test run` | Wave 0 |
| DAEMON-02 | `persistEvent()` writes a row and the returned `sequenceNumber` matches the SQLite rowid | unit | `pnpm --filter @cockpit/daemon test run` | Wave 0 |
| DAEMON-03 | Reconnecting client with `lastSeenSequence=N` receives exactly events `N+1..M` in order | integration | `pnpm --filter @cockpit/daemon test run` | Wave 0 |
| DAEMON-03 | First-connect client with `lastSeenSequence=0` receives all persisted events | integration | `pnpm --filter @cockpit/daemon test run` | Wave 0 |
| DAEMON-03 | Reconnecting client with `lastSeenSequence=MAX` receives zero events (no duplicates) | integration | `pnpm --filter @cockpit/daemon test run` | Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @cockpit/shared test run && pnpm --filter @cockpit/daemon test run`
- **Per wave merge:** `pnpm test run` (full suite, all packages)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/shared/src/__tests__/events.test.ts` — covers DAEMON-01 schema validation
- [ ] `packages/daemon/src/__tests__/database.test.ts` — covers DAEMON-02 WAL mode + insert
- [ ] `packages/daemon/src/__tests__/ws-catchup.test.ts` — covers DAEMON-03 catch-up protocol
- [ ] `packages/shared/vitest.config.ts` — per-package vitest config
- [ ] `packages/daemon/vitest.config.ts` — per-package vitest config
- [ ] `vitest.config.ts` (root) — projects config
- [ ] `pnpm-workspace.yaml` — monorepo workspace definition
- [ ] Framework install: `pnpm add -D vitest tsx typescript` (root) + `pnpm add -D vitest` per package

---

## Open Questions

1. **SQLite database file location**
   - What we know: Must be local, survive daemon restart
   - What's unclear: Should the path be `~/.config/agent-cockpit/events.db` (XDG), `./data/events.db` (cwd), or configurable? The project says "local-first" but doesn't specify the path convention.
   - Recommendation: Default to `~/.local/share/agent-cockpit/events.db` (XDG data dir) with an env var override `COCKPIT_DB_PATH`. Decide in Wave 1 planning.

2. **WebSocket port**
   - What we know: Browser UI will connect to localhost
   - What's unclear: Default port number. Needs to be documented so the Phase 3 browser UI knows where to connect.
   - Recommendation: Default to `3001` with an env var `COCKPIT_WS_PORT`. Expose the port in the daemon's startup log line.

3. **Event payload storage: full blob vs column-per-field**
   - What we know: Phase 1 stores the full JSON payload in a `TEXT` column
   - What's unclear: Phase 5 (Timeline) and Phase 8 (Search) will query by event type and session. The current schema has `type` and `session_id` indexed — sufficient for Phase 1.
   - Recommendation: Keep the current blob-plus-index approach for Phase 1. Revisit schema at Phase 5 if query performance is insufficient.

---

## Sources

### Primary (HIGH confidence)

- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3) — WAL mode, checkpoint, INTEGER PRIMARY KEY patterns, v12.8.0 confirmed
- [better-sqlite3 performance docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md) — WAL pragma, checkpoint interval pattern
- [ws GitHub / npm](https://github.com/websockets/ws) — v8.18.3, server API, broadcast pattern, noServer upgrade pattern
- [Zod v4 docs](https://zod.dev/v4) — discriminated union, safeParse, schema versioning
- [pnpm workspaces docs](https://pnpm.io/workspaces) — workspace:* protocol, pnpm-workspace.yaml
- [Vitest projects config](https://vitest.dev/guide/projects) — `test.projects` replacing `vitest.workspace.ts` in Vitest 3.2+
- [SQLite AUTOINCREMENT docs](https://sqlite.org/autoinc.html) — confirmed plain INTEGER PRIMARY KEY is preferred

### Secondary (MEDIUM confidence)

- [WebSocket.org reconnection guide](https://websocket.org/guides/reconnection/) — sequence number catch-up protocol pattern (verified by implementation logic)
- [@types/better-sqlite3 npm](https://www.npmjs.com/package/@types/better-sqlite3) — v7.6.13 confirmed current (April 2025)
- [@types/ws npm](https://www.npmjs.com/package/@types/ws) — v8.18.1 confirmed current

### Tertiary (LOW confidence)

- Multiple community articles on pnpm + Vitest monorepo setup — corroborating the `projects` pattern but not directly from official docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against npm/GitHub as of April 2026
- Architecture: HIGH — patterns derived from official docs and library READMEs
- Pitfalls: MEDIUM-HIGH — off-by-one and WAL assertion pitfalls are verified against SQLite and better-sqlite3 docs; broadcast race is derived from Node.js single-thread model

**Research date:** 2026-04-05
**Valid until:** 2026-07-05 (90 days — stack is stable; Zod v4 is the current major)
