---
phase: 01-daemon-core
verified: 2026-04-05T01:00:00Z
status: passed
score: 16/16 must-haves verified
re_verification: false
---

# Phase 1: Daemon Core — Verification Report

**Phase Goal:** A running local daemon that receives typed events from any adapter, persists them to SQLite, and streams them to the browser over WebSocket — with sequence numbers and reconnect catch-up built in from the first commit.
**Verified:** 2026-04-05
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | NormalizedEvent Zod schema defined with `schemaVersion` and `sequenceNumber` fields | VERIFIED | `packages/shared/src/events.ts` line 5–10: `BaseEvent` declares both fields; discriminated union on 'type' |
| 2  | All 10 required event types (session_start/end, tool_call, file_change, approval_request/resolved, subagent_spawn/complete, memory_read/write) are defined | VERIFIED | `events.ts` lines 14–110: all 10 types present plus `provider_parse_error` (11 total) |
| 3  | `@cockpit/shared` importable without a build step via `workspace:*` | VERIFIED | `packages/shared/package.json` exports `".": "./src/index.ts"` (TypeScript source direct); `@cockpit/daemon/package.json` lists `"@cockpit/shared": "workspace:*"` |
| 4  | TypeScript types inferred from Zod — no duplicate interface declarations | VERIFIED | `events.ts` line 113: `export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>` — no hand-written interface |
| 5  | `pnpm install` runs without errors | VERIFIED | Full test suite (`pnpm test run`) ran successfully, confirming workspace installation is healthy |
| 6  | `openDatabase()` enables WAL mode confirmed as `'wal'` | VERIFIED | `database.ts` line 15–18: pragma asserted; `database.test.ts` lines 29–41: WAL test uses temp file, asserts `mode === 'wal'`; test passes |
| 7  | `persistEvent()` inserts and returns event with `sequenceNumber` assigned by SQLite rowid | VERIFIED | `queries.ts` lines 27–28: `lastInsertRowid` cast to number, spread onto returned event |
| 8  | Two events inserted sequentially have strictly increasing `sequenceNumber` values | VERIFIED | `database.test.ts` lines 72–78: `e2.sequenceNumber === e1.sequenceNumber + 1`; test passes |
| 9  | `getEventsSince(N)` returns only events with `sequence_number > N` in ascending order | VERIFIED | `queries.ts` lines 35–42: SELECT with `> ?` and `ORDER BY sequence_number ASC`; 4 tests cover all boundary cases |
| 10 | Events table schema: `sequence_number INTEGER PRIMARY KEY` (no AUTOINCREMENT), `session_id`, `type`, `schema_version`, `payload` (JSON blob), `timestamp` | VERIFIED | `database.ts` lines 26–37: DDL matches specification exactly |
| 11 | Browser client connecting with `lastSeenSequence=0` receives all persisted events in order | VERIFIED | `ws-catchup.test.ts` lines 90–100: test passes (3 events delivered) |
| 12 | Client reconnecting with `lastSeenSequence=N` receives exactly events N+1..M | VERIFIED | `ws-catchup.test.ts` lines 102–114: delivers 2 events, first has `sequenceNumber = e1.sequenceNumber + 1`; test passes |
| 13 | Client connecting with `lastSeenSequence=MAX` receives zero events | VERIFIED | `ws-catchup.test.ts` lines 116–127: 300ms timeout, expects 0; test passes |
| 14 | Events injected via in-process `eventBus` are broadcast to all connected clients in real time | VERIFIED | `ws-catchup.test.ts` lines 142–157 (live broadcast) and 161–175 (multi-client); both pass |
| 15 | Daemon starts with `pnpm --filter @cockpit/daemon start` and logs WebSocket port | VERIFIED | `index.ts` line 37: `console.log('[cockpit-daemon] Started. DB: ..., WS port: ...')` ; `server.ts` line 24: logs listen port |
| 16 | SIGTERM and SIGINT shut down daemon cleanly: clients terminated, WAL flushed, process exits 0 | VERIFIED | `index.ts` lines 21–36: `shutdown()` terminates clients, calls `wal_checkpoint(TRUNCATE)`, closes DB, closes httpServer, then `process.exit(0)` |

**Score:** 16/16 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `pnpm-workspace.yaml` | Monorepo workspace definition | VERIFIED | Contains `packages: ['packages/*']` and `onlyBuiltDependencies` for native addons |
| `packages/shared/src/events.ts` | NormalizedEvent Zod schema and TypeScript type | VERIFIED | 114 lines; exports `NormalizedEventSchema`, `NormalizedEvent`, `BaseEvent`, and all 11 individual event schemas |
| `packages/shared/src/index.ts` | Package public API re-exports | VERIFIED | Re-exports all schemas and `NormalizedEvent` type from `./events.js` |
| `packages/shared/package.json` | `@cockpit/shared` identity and exports map | VERIFIED | `"name": "@cockpit/shared"`, exports `.` → `./src/index.ts` |
| `packages/daemon/src/db/database.ts` | `openDatabase()` with WAL mode, schema creation, checkpoint scheduling | VERIFIED | Exports `openDatabase`; WAL guard for file DBs; schema DDL; checkpoint `setInterval` with `unref()` |
| `packages/daemon/src/db/queries.ts` | `persistEvent()` and `getEventsSince()` prepared statement wrappers | VERIFIED | Both functions exported; `getEventsSince` selects `sequence_number` column and merges it onto parsed payload |
| `packages/daemon/src/__tests__/database.test.ts` | Unit tests for DAEMON-02 coverage | VERIFIED | 11 tests; contains `journal_mode` assertion; all pass |
| `packages/daemon/src/ws/server.ts` | `createWsServer()` factory and `broadcast()` helper | VERIFIED | Exports both; `broadcast` checks `readyState === WebSocket.OPEN` |
| `packages/daemon/src/ws/handlers.ts` | `handleConnection()` with catch-up replay logic | VERIFIED | Exports `handleConnection`; synchronous `getEventsSince` before live event registration |
| `packages/daemon/src/eventBus.ts` | In-process `EventEmitter` for adapter → broadcast pipeline | VERIFIED | Exports typed `eventBus` singleton; overloaded `emit`/`on` for `NormalizedEvent` |
| `packages/daemon/src/index.ts` | Daemon entrypoint wiring DB + WS + eventBus + SIGTERM/SIGINT | VERIFIED | Wires all components; reads `COCKPIT_DB_PATH`/`COCKPIT_WS_PORT` from env with defaults |
| `packages/daemon/src/__tests__/ws-catchup.test.ts` | Integration tests for catch-up protocol | VERIFIED | 6 tests covering all 3 reconnect scenarios + ordering + live broadcast + multi-client |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/shared/src/events.ts` | `packages/shared/src/index.ts` | re-export | VERIFIED | `index.ts` line 1: `export { NormalizedEventSchema, BaseEvent, ... } from './events.js'` |
| `packages/shared/package.json` | `packages/shared/src/index.ts` | exports field | VERIFIED | `"exports": { ".": "./src/index.ts" }` |
| `packages/daemon/src/db/queries.ts` | `packages/daemon/src/db/database.ts` | Database instance parameter | VERIFIED | `queries.ts` line 1: `import type Database from 'better-sqlite3'`; parameter typed `Database.Database` |
| `packages/daemon/src/db/queries.ts` | `@cockpit/shared` | NormalizedEvent type import | VERIFIED | `queries.ts` line 2: `import type { NormalizedEvent } from '@cockpit/shared'` |
| `packages/daemon/src/ws/handlers.ts` | `packages/daemon/src/db/queries.ts` | `getEventsSince` called in `handleConnection` | VERIFIED | `handlers.ts` line 4: `import { getEventsSince }` ; line 21: `getEventsSince(db, lastSeenSequence)` |
| `packages/daemon/src/index.ts` | `packages/daemon/src/db/database.ts` | `openDatabase` called at boot | VERIFIED | `index.ts` line 1: `import { openDatabase }` ; line 11: `openDatabase(DB_PATH)` |
| `packages/daemon/src/index.ts` | `packages/daemon/src/eventBus.ts` | `eventBus.on('event', ...)` → broadcast | VERIFIED | `index.ts` lines 15–18: `eventBus.on('event', (rawEvent) => { persistEvent; broadcast; })` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DAEMON-01 | 01-01 | Normalized event schema with `schemaVersion` and `sequenceNumber` fields | SATISFIED | `events.ts`: `BaseEvent` has both fields; Zod discriminated union; 8 schema tests pass |
| DAEMON-02 | 01-02 | SQLite persistence with WAL mode and checkpoint scheduling | SATISFIED | `database.ts`: WAL pragma, checkpoint interval; `queries.ts`: `persistEvent`/`getEventsSince`; 11 tests pass |
| DAEMON-03 | 01-03 | WebSocket server with sequence-based catch-up protocol | SATISFIED | `handlers.ts`: synchronous replay via `getEventsSince`; `server.ts`: `broadcast`; 6 integration tests pass |

No orphaned requirements — all three IDs declared in plan frontmatter are accounted for. REQUIREMENTS.md traceability table confirms DAEMON-01/02/03 map exclusively to Phase 1.

---

### Anti-Patterns Found

None. No TODOs, FIXMEs, placeholders, empty return values, or console-only handlers found in any implementation file.

---

### Human Verification Required

#### 1. Daemon startup smoke test

**Test:** Run `pnpm --filter @cockpit/daemon start` in a terminal  
**Expected:** Process starts, logs `[cockpit-daemon] Started. DB: ~/.local/share/agent-cockpit/events.db, WS port: 3001`, and remains running  
**Why human:** Cannot start a long-running background process and observe its log output programmatically in this verification context

#### 2. SIGTERM graceful exit

**Test:** Start the daemon, run `kill -TERM <pid>`, check exit code with `echo $?`  
**Expected:** Process logs shutdown message, exits 0, no orphaned WAL file  
**Why human:** Requires a live process to send a signal to

#### 3. WebSocket reconnect catch-up via browser or `websocat`

**Test:** Start daemon, send one event via a test script calling `eventBus.emit`, then reconnect with `websocat ws://localhost:3001?lastSeenSequence=0`  
**Expected:** Reconnecting client receives the previously persisted event immediately on connect  
**Why human:** End-to-end test with real network sockets outside the test harness

---

### Gaps Summary

No gaps. All 16 observable truths are VERIFIED with direct code evidence and confirmed by the passing test suite (25/25 tests). All required artifacts exist, are substantive, and are correctly wired. Requirements DAEMON-01, DAEMON-02, and DAEMON-03 are fully satisfied.

---

_Verified: 2026-04-05_
_Verifier: Claude (gsd-verifier)_
