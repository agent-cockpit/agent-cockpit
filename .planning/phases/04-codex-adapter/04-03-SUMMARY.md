---
phase: 04-codex-adapter
plan: 03
subsystem: adapter, approval
tags: [codex, adapter, child-process, jsonrpc, tdd, vitest]

# Dependency graph
requires:
  - phase: 04-codex-adapter
    plan: 02
    provides: codexParser.ts (parseCodexLine), codexRiskClassifier.ts, _codexServerId side-channel
  - phase: 02-claude-adapter-approval-foundation
    provides: ApprovalQueue, approvalQueue.ts, resolveApproval pattern
  - phase: 01-daemon-core
    provides: eventBus, database schema (codex_sessions table)
provides:
  - codexAdapter.ts: CodexAdapter class + resolveCodexApproval module export
  - ws/server.ts: POST /api/sessions Codex branch spawns CodexAdapter
  - approvalQueue.ts: resolveCodexApproval called alongside resolveApproval
affects: [05-approvals-ui, 07-memory-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - procFactory injection pattern for testable child-process adapters
    - Module-level Map<string, resolver> for per-approvalId Codex resolver dispatch
    - Auto-reply polling helper in tests drives async JSON-RPC handshake without spawning real process
    - pendingCodexApprovals Map<number, {approvalId, timer}> keyed by Codex server integer id
    - Thread resume with fallback to thread/start on failure

key-files:
  created:
    - packages/daemon/src/adapters/codex/codexAdapter.ts
  modified:
    - packages/daemon/src/adapters/codex/__tests__/codexAdapter.test.ts
    - packages/daemon/src/ws/server.ts
    - packages/daemon/src/approvals/approvalQueue.ts

key-decisions:
  - "procFactory parameter injected into CodexAdapter constructor for test isolation — default factory spawns real codex binary; tests inject EventEmitter mock"
  - "approvalQueue.register() called from handleServerRequest in addition to onEvent() — approval appears in both the event bus and approval DB without double-register risk"
  - "resolveCodexApproval is a no-op guard (Map.get + early return) so both resolvers can be called unconditionally in approvalQueue.decide/handleTimeout"
  - "Auto-reply polling helper (setInterval 0ms) drives async JSON-RPC handshake in tests — avoids manual interleaving of emitLine calls between awaits"

# Metrics
duration: ~15min
completed: 2026-04-06
---

# Phase 4 Plan 03: CodexAdapter Integration Summary

**CodexAdapter class wired into POST /api/sessions: spawn, readline loop, JSON-RPC handshake, thread/start+resume, approval dispatch — 4 TDD tests GREEN, 71 total daemon tests pass**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-04-06
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Expanded 4 `it.todo` stubs to full passing assertions covering: approval reply (accept), approval deny (decline), session resume (thread/resume instead of thread/start), and process guard (no-op after kill)
- Implemented `CodexAdapter` class: process factory injection, readline loop over mock-compatible 'line' events, JSON-RPC handshake sequence, `pendingCodexApprovals` Map, `resolveCodexApproval` module export
- Wired `CodexAdapter` into `ws/server.ts` POST /api/sessions Codex branch — previous stub replaced with real adapter instantiation + start()
- `approvalQueue.ts` now calls both `resolveApproval` (Claude) and `resolveCodexApproval` (Codex) in `decide()` and `handleTimeout()` — both are no-ops when approvalId doesn't match
- ENOENT guard: if codex binary not on PATH, `start()` emits `provider_parse_error` event and returns (daemon keeps running)
- 30-second auto-deny timer fires for unresolved approval requests if process exits or timeout elapses

## Task Commits

Each task was committed atomically:

1. **Task 1: Expand adapter test stubs + implement CodexAdapter class** - `ad914f1` (feat)
2. **Task 2: Wire CodexAdapter into ws/server.ts and approvalQueue.ts** - `90ba19d` (feat)

## Files Created/Modified

- `packages/daemon/src/adapters/codex/codexAdapter.ts` — Created: CodexAdapter class + resolveCodexApproval export
- `packages/daemon/src/adapters/codex/__tests__/codexAdapter.test.ts` — Expanded 4 it.todo stubs to full assertions
- `packages/daemon/src/ws/server.ts` — Replaced Codex stub with CodexAdapter instantiation
- `packages/daemon/src/approvals/approvalQueue.ts` — Added resolveCodexApproval calls in decide() + handleTimeout()

## Decisions Made

- `procFactory` injected into CodexAdapter constructor for testability — tests provide an EventEmitter mock, production uses real `spawn('codex', ['app-server'])`
- `approvalQueue.register()` called from `handleServerRequest` AND `onEvent()` called — approval is both persisted in DB and dispatched to UI
- Auto-reply polling helper in tests (`setInterval(autoReply, 0)`) drives the async JSON-RPC handshake without manually interleaving `emitLine` calls between awaits
- `resolveCodexApproval` is a no-op guard so both resolvers are called unconditionally in `approvalQueue`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test timing: synchronous emitLine calls before awaits**
- **Found during:** Task 1 RED/GREEN
- **Issue:** Original test design emitted lines synchronously before `await startPromise`, causing second emitLine to fire before the second `sendRequest` registered its pending resolver — all 4 tests timed out
- **Fix:** Replaced with `startAdapter()` helper using `setInterval(autoReply, 0)` to respond to each outgoing stdin write as it appears, interleaving correctly with the adapter's async awaits
- **Files modified:** `codexAdapter.test.ts`
- **Commit:** `ad914f1`

## Pre-existing Issues (Out of Scope)

Four TypeScript errors exist in files not modified by this plan:
- `hook-server.test.ts`: HookPayload type mismatch and union property access
- `ws-catchup.test.ts`: Database namespace export error
- `eventBus.ts`: Overload signature compatibility

Logged to `.planning/phases/04-codex-adapter/deferred-items.md`.

## Self-Check: PASSED
