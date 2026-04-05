---
phase: 01-daemon-core
plan: 03
subsystem: websocket
tags: [websocket, catch-up, tdd, vitest, typescript, eventbus, graceful-shutdown]

# Dependency graph
requires:
  - phase: 01-01
    provides: "@cockpit/shared NormalizedEvent Zod schema and TypeScript type"
  - phase: 01-02
    provides: "openDatabase(), persistEvent(), getEventsSince() — SQLite persistence layer"
provides:
  - createWsServer() — HTTP + WebSocket server factory with upgrade handling
  - broadcast() — sends JSON payload to all WebSocket.OPEN clients
  - handleConnection() — sequence-based catch-up replay on connect
  - eventBus — typed DaemonEventBus (EventEmitter) for adapter → broadcast pipeline
  - index.ts — daemon entrypoint wiring DB + WS + eventBus, SIGTERM/SIGINT shutdown
affects:
  - All future phases that send events to the browser (Phase 3 - browser UI shell)
  - Phase 2 adapters (emit on eventBus to persist + broadcast)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Synchronous catch-up replay before live event subscription (no async gap)
    - better-sqlite3 synchronous query ensures atomic catch-up (no new events during replay)
    - WebSocketServer noServer mode + HTTP upgrade handling (avoids port conflict)
    - Typed EventEmitter override pattern for DaemonEventBus
    - Graceful shutdown: terminate clients → wss.close → WAL checkpoint TRUNCATE → db.close → httpServer.close → exit 0

key-files:
  created:
    - packages/daemon/src/ws/server.ts
    - packages/daemon/src/ws/handlers.ts
    - packages/daemon/src/eventBus.ts
    - packages/daemon/src/index.ts
    - packages/daemon/src/__tests__/ws-catchup.test.ts
  modified:
    - packages/daemon/src/db/queries.ts (bug fix: getEventsSince now returns sequenceNumber)

key-decisions:
  - "Synchronous catch-up before live events — better-sqlite3 is sync and Node is single-threaded, so the replay loop is atomic; no async gaps introduced"
  - "WebSocketServer noServer mode — avoids binding WS server directly to a port, allowing the HTTP server to own the port and handle upgrades explicitly"
  - "getEventsSince selects sequence_number column and merges into parsed payload — payload JSON stored at insert time does not include sequenceNumber; it must be added on read"

patterns-established:
  - "Catch-up pattern: getEventsSince synchronously before ws.on('message') registration"
  - "eventBus pattern: emit('event', normalizedEvent) in adapters, subscribe in index.ts to persist+broadcast"
  - "Daemon shutdown pattern: terminate clients → close WSS → checkpoint WAL → close DB → close HTTP → exit"

requirements-completed: [DAEMON-03]

# Metrics
duration: 2min
completed: 2026-04-05
---

# Phase 1 Plan 03: WebSocket Catch-up Server + Daemon Wiring Summary

**WebSocket server with sequence-based catch-up replay, typed eventBus pipeline, and graceful-shutdown daemon entrypoint — 6 integration tests passing, full suite 25/25 green**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-05T03:53:07Z
- **Completed:** 2026-04-05T03:55:07Z
- **Tasks:** 2 (RED + GREEN, TDD)
- **Files modified:** 6

## Accomplishments

- `ws/server.ts`: `createWsServer()` factory wires HTTP upgrade to WebSocket, `broadcast()` sends to all OPEN clients
- `ws/handlers.ts`: `handleConnection()` parses `lastSeenSequence` from URL, runs synchronous catch-up replay via `getEventsSince()`, then registers live event handlers
- `eventBus.ts`: typed `DaemonEventBus` extending `EventEmitter` with overloaded `emit`/`on` signatures for `NormalizedEvent`
- `index.ts`: daemon entrypoint reads `COCKPIT_DB_PATH` and `COCKPIT_WS_PORT` from env (documented defaults), wires `eventBus → persistEvent → broadcast` pipeline, handles `SIGTERM`/`SIGINT` with graceful shutdown
- Daemon starts with `pnpm --filter @cockpit/daemon start`, logs DB path and WS port, shuts down cleanly (exit 0)
- All 6 catch-up integration tests pass; full suite 25/25 (shared + daemon)

## Task Commits

Each task was committed atomically:

1. **RED: failing WebSocket catch-up tests** - `88aecc0` (test)
2. **GREEN: WebSocket implementation + daemon wiring** - `ddc0b99` (feat)

## Files Created/Modified

- `packages/daemon/src/ws/server.ts` — `createWsServer()` and `broadcast()` exports
- `packages/daemon/src/ws/handlers.ts` — `handleConnection()` with synchronous catch-up replay
- `packages/daemon/src/eventBus.ts` — typed `DaemonEventBus` singleton
- `packages/daemon/src/index.ts` — daemon entrypoint: DB + WS + eventBus + graceful shutdown
- `packages/daemon/src/__tests__/ws-catchup.test.ts` — 6 integration tests
- `packages/daemon/src/db/queries.ts` — bug fix: `getEventsSince` returns `sequenceNumber`

## Decisions Made

- Synchronous catch-up before live events: `better-sqlite3` is synchronous and Node.js is single-threaded, so the replay loop is atomic — no new events can arrive from `eventBus` during replay.
- `WebSocketServer` in `noServer` mode with explicit HTTP upgrade handling — avoids binding WS server directly to a port, enabling clean lifecycle control.
- `getEventsSince` must select and return `sequence_number` from the DB row — the stored `payload` JSON was captured at insert time without `sequenceNumber`, so it must be added on read by merging the DB column value.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed getEventsSince missing sequenceNumber in returned events**
- **Found during:** GREEN phase (test "delivers only missed events to client with lastSeenSequence=1")
- **Issue:** `getEventsSince` selected only `payload` from the DB. The stored payload JSON does not contain `sequenceNumber` (it was added in-memory by `persistEvent` after the INSERT, but was never written back into the stored JSON). Deserialized catch-up messages had `sequenceNumber: undefined`.
- **Fix:** Changed the SELECT to include `sequence_number` column and merge it as `sequenceNumber` on the returned object: `{ ...JSON.parse(row.payload), sequenceNumber: row.sequence_number }`.
- **Files modified:** `packages/daemon/src/db/queries.ts`
- **Verification:** All 17 daemon tests pass; full suite 25/25
- **Committed in:** `ddc0b99` (GREEN task commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Correctness fix — the existing 01-02 tests did not cover the round-trip `getEventsSince → sequenceNumber present` assertion. No scope change.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 1 is complete: monorepo scaffold, shared schema, SQLite persistence, WebSocket catch-up server, daemon entrypoint
- The daemon is fully functional and can be started with `pnpm --filter @cockpit/daemon start`
- Phase 2 (Claude Code adapter) can emit events on `eventBus` to trigger persist + broadcast
- Full test suite (25 tests) is green — no blockers

---

*Phase: 01-daemon-core*
*Completed: 2026-04-05*

## Self-Check: PASSED

- FOUND: packages/daemon/src/ws/server.ts
- FOUND: packages/daemon/src/ws/handlers.ts
- FOUND: packages/daemon/src/eventBus.ts
- FOUND: packages/daemon/src/index.ts
- FOUND: packages/daemon/src/__tests__/ws-catchup.test.ts
- FOUND: .planning/phases/01-daemon-core/01-03-SUMMARY.md
- FOUND commit 88aecc0 (RED tests)
- FOUND commit ddc0b99 (GREEN implementation)
