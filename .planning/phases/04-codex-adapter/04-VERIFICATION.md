---
phase: 04-codex-adapter
verified: 2026-04-05T10:25:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 4: Codex Adapter Verification Report

**Phase Goal:** Codex sessions appear in the same session list and approval inbox as Claude sessions. The adapter handles stdio JSON-RPC, session resume, and Codex approval events without modifying the daemon core or the browser UI.
**Verified:** 2026-04-05T10:25:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `codex_sessions` table exists in schema after `openDatabase()` returns | VERIFIED | `database.ts` lines 60-65: `CREATE TABLE IF NOT EXISTS codex_sessions (session_id, thread_id, workspace, created_at)` in the `db.exec()` block |
| 2 | Codex JSONL notifications are converted to correct NormalizedEvent types | VERIFIED | `codexParser.ts` switch on `msg.method` covers all 6 event types; 11 tests green |
| 3 | `session_start` is emitted only once per session regardless of turn count | VERIFIED | `codexParser.ts` lines 52-63: `if (ctx.sessionStartEmitted) return null`; mutates ctx flag after first emit |
| 4 | `approval_request` events carry correct `actionType` and `riskLevel` from the classifier | VERIFIED | `codexRiskClassifier.ts`: shell_command/high for `rm`, medium for safe commands; file_change/medium always |
| 5 | Malformed JSONL produces `provider_parse_error` without throwing | VERIFIED | `codexParser.ts` lines 36-46: try/catch returns `provider_parse_error` with `rawPayload` and `errorMessage` |
| 6 | POST /api/sessions with `provider=codex` spawns CodexAdapter and returns sessionId | VERIFIED | `ws/server.ts` lines 36-47: `new CodexAdapter(...)` + `adapter.start()` in Codex branch; `launch-session.test.ts` 6 tests green |
| 7 | Codex approval requests appear in the unified approval inbox alongside Claude approvals | VERIFIED | `codexAdapter.ts` line 322: `approvalQueue.register(approvalId, event, this.db)` in `handleServerRequest`; `approvalQueue.ts` imports and calls `resolveCodexApproval` |
| 8 | Approving or denying a Codex approval writes the correct JSON-RPC reply to child process stdin | VERIFIED | `codexAdapter.ts` lines 199-210: decision-to-string map, guarded write; 2 adapter tests cover approve→'accept' and deny→'decline' |
| 9 | A Codex session can be resumed: `thread/resume` is called with the persisted `threadId` | VERIFIED | `codexAdapter.ts` lines 146-158: DB lookup for `thread_id`, falls through to `thread/resume` if found; adapter test 3 confirms `thread/start` absent when threadId exists |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/daemon/src/db/database.ts` | `codex_sessions` DDL in schema block | VERIFIED | Lines 60-65; substantive schema with 4 columns including PK |
| `packages/daemon/src/adapters/codex/codexParser.ts` | `parseCodexLine` + `CodexParserContext` exports | VERIFIED | 131 lines; exports `parseCodexLine`, `CodexParserContext`, `CodexMessage` |
| `packages/daemon/src/adapters/codex/codexRiskClassifier.ts` | `classifyCodexApproval` export | VERIFIED | 76 lines; exports `classifyCodexApproval`, `ActionType`, `RiskLevel` |
| `packages/daemon/src/adapters/codex/codexAdapter.ts` | `CodexAdapter` class + `resolveCodexApproval` export | VERIFIED | 327 lines; full implementation with pendingRequests/pendingCodexApprovals Maps |
| `packages/daemon/src/adapters/codex/__tests__/codexParser.test.ts` | 8 parser tests + 3 classifier tests | VERIFIED | 184 lines; 11 full-assertion tests — all green |
| `packages/daemon/src/adapters/codex/__tests__/codexAdapter.test.ts` | 4 adapter tests | VERIFIED | 263 lines; 4 full-assertion tests — all green |
| `packages/daemon/src/ws/server.ts` | POST /api/sessions Codex branch creates CodexAdapter | VERIFIED | Lines 7-47: imports `CodexAdapter`, instantiates in else branch |
| `packages/daemon/src/approvals/approvalQueue.ts` | Calls `resolveCodexApproval` in `decide()` and `handleTimeout()` | VERIFIED | Lines 5, 97, 130: import + two call sites |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `codexParser.test.ts` | `codexParser.ts` | `import { parseCodexLine }` | WIRED | Line 3: `import { parseCodexLine, type CodexParserContext } from '../codexParser.js'` |
| `codexParser.ts` | `codexRiskClassifier.ts` | `import classifyCodexApproval` | WIRED | Line 3: `import { classifyCodexApproval } from './codexRiskClassifier.js'` |
| `codexAdapter.test.ts` | `codexAdapter.ts` | `import { CodexAdapter }` | WIRED | Line 5: `import { CodexAdapter } from '../codexAdapter.js'` |
| `ws/server.ts` | `codexAdapter.ts` | `new CodexAdapter(...)` on POST /api/sessions with provider=codex | WIRED | Lines 7, 36-44: import + instantiation + start() |
| `codexAdapter.ts` | `approvalQueue.ts` | `approvalQueue.register()` in `handleServerRequest` | WIRED | Lines 6, 322: import + call |
| `approvalQueue.ts` | `codexAdapter.ts` | `resolveCodexApproval()` in `decide()` and `handleTimeout()` | WIRED | Lines 5, 97, 130: import + two unconditional call sites |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| DAEMON-05 | 04-01, 04-02, 04-03 | System includes a Codex adapter connecting to `codex app-server` via stdio JSON-RPC, parsing item/turn events, handling approval requests in-band, and supporting session resume | SATISFIED | `codexAdapter.ts`: stdio spawn + readline JSON-RPC loop; `codexParser.ts`: item/turn JSONL parsing; approval reply via `resolveApproval()`; session resume via `thread/resume` + DB lookup |

No orphaned requirements — DAEMON-05 is the only requirement mapped to Phase 4 in REQUIREMENTS.md traceability table and all three plans claim it.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None | — | — | — |

No TODO/FIXME/placeholder comments in Phase 4 files. No stub return values (`return null`, `return {}`, `return []` as sole implementations). The Codex stub previously in `ws/server.ts` (documented in plan 03 interfaces) has been replaced with the real CodexAdapter instantiation.

---

### Pre-existing TypeScript Errors (Not Phase 4 Regressions)

Four TypeScript errors exist in files last modified in Phases 1-2, documented in the Plan 03 SUMMARY as "Pre-existing Issues (Out of Scope)":

- `src/__tests__/hook-server.test.ts`: HookPayload type mismatch and union property access (last modified: Phase 2, commit `6ea65e1`)
- `src/__tests__/ws-catchup.test.ts`: Database namespace export error (last modified: Phase 1)
- `src/eventBus.ts`: Overload signature compatibility (last modified: Phase 1)

These errors predate Phase 4 and are not regressions caused by Phase 4 work. `pnpm --filter @cockpit/daemon test --run` passes all 71 tests despite them.

---

### Human Verification Required

#### 1. Real Codex Binary Integration

**Test:** Install `codex` CLI, start the daemon, POST `/api/sessions` with `provider=codex` and a real workspace path, then observe whether events flow into the browser UI.
**Expected:** Session appears in the session list, approval requests from Codex appear in the approval inbox alongside any Claude sessions, and approving/denying sends the correct JSON-RPC reply.
**Why human:** Requires a real `codex app-server` binary, real Codex API credentials, and browser-level UI verification. The tests mock the child process — real stdio behavior, handshake timing, and actual JSONL format from production Codex cannot be verified programmatically against this codebase alone.

#### 2. ENOENT Graceful Degradation in Production

**Test:** Ensure `codex` is NOT on PATH, start the daemon, POST `/api/sessions` with `provider=codex`.
**Expected:** HTTP 200 is returned with `{ sessionId, mode: 'spawn' }`, a `provider_parse_error` event with `errorMessage: 'codex binary not found on PATH'` is broadcast over WebSocket, and the daemon continues serving other requests normally.
**Why human:** The ENOENT path is covered by the `proc.on('error')` handler (async event), but production spawn behavior differs between sync ENOENT (caught in try/catch) and async ENOENT (caught via error event). Runtime verification against a real Node process is needed to confirm which path fires.

---

### Gaps Summary

No gaps found. All 9 observable truths are verified, all artifacts exist and are substantive, all key links are wired, and the only requirement (DAEMON-05) is fully satisfied.

The phase goal is achieved: Codex sessions participate in the unified session/approval flow via `CodexAdapter`, the adapter handles stdio JSON-RPC with the readline loop, session resume is DB-backed via `codex_sessions`, and Codex approval events flow through the same `ApprovalQueue` as Claude approvals — without any modifications to the daemon core architecture or browser UI.

---

**Verified:** 2026-04-05T10:25:00Z
**Verifier:** Claude (gsd-verifier)
