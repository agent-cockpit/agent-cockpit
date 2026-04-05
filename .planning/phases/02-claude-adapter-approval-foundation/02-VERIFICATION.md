---
phase: 02-claude-adapter-approval-foundation
verified: 2026-04-05T01:58:00Z
status: human_needed
score: 17/17 must-haves verified
re_verification: false
human_verification:
  - test: "Start the daemon and verify the hook server logs on port 3002"
    expected: "Console output includes '[cockpit-daemon] Hook server listening on port 3002' and '[cockpit-daemon] Started. DB: ..., WS port: 3001'"
    why_human: "Cannot run process and inspect stdout programmatically in this context"
  - test: "Send a SIGTERM to the running daemon and verify graceful shutdown"
    expected: "Console output includes '[cockpit-daemon] Shutting down...' and process exits 0"
    why_human: "Requires process lifecycle observation"
  - test: "Configure ~/.claude/settings.json with hook URLs and start a Claude Code session"
    expected: "Daemon logs incoming hook events (SessionStart, PreToolUse, etc.) without crashing"
    why_human: "Requires external Claude Code process and real hook delivery"
---

# Phase 02: Claude Adapter + Approval Foundation — Verification Report

**Phase Goal:** Claude Code sessions are visible in the daemon with real hook events. The full approval round-trip — PreToolUse hook to browser decision back to Claude Code HTTP response — works end-to-end, with per-approval timeout and auto-deny shipping in the same release.
**Verified:** 2026-04-05T01:58:00Z
**Status:** human_needed — all automated checks pass, 3 items require human testing
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POSTing a SessionStart hook payload emits session_start NormalizedEvent on eventBus | VERIFIED | hookServer.ts line 141: `onEvent(event)` called for non-approval hooks; hookParser.ts maps `SessionStart` → `session_start`; Test 12 (hook-server.test.ts) green |
| 2 | POSTing a non-blocking PreToolUse payload emits tool_call event and responds 200 immediately | VERIFIED | hookParser.ts lines 96–100: non-approval PreToolUse → `tool_call`; hookServer.ts lines 140–143: `onEvent` called + `res.end(JSON.stringify({}))`; Test 4 + Test 12 green |
| 3 | POSTing a blocking PreToolUse payload emits approval_request and HTTP response is held open | VERIFIED | hookServer.ts lines 112–139: `requiresApproval=true` path stores in `pendingApprovals` Map, calls `onDecisionNeeded`, does NOT call `res.end()`; Test 13 green |
| 4 | Each approval_request event has actionType and riskLevel from tool_name + tool_input heuristics | VERIFIED | hookParser.ts lines 75–89: `classifyRisk()` called for all high-risk PreToolUse; riskClassifier.ts full implementation; Tests 8–11 green |
| 5 | Same Claude Code session_id always maps to same UUID sessionId across multiple calls | VERIFIED | hookParser.ts lines 18–27: module-level `sessionIdCache` Map, `getOrCreateSessionId()` reuses UUID; Test 2 green |
| 6 | approvals and always_allow_rules tables exist after openDatabase() | VERIFIED | database.ts lines 38–59: both tables in `db.exec()` CREATE TABLE IF NOT EXISTS; Test 16 (hook-server.test.ts) + database.test.ts green |
| 7 | approval_request arriving via onDecisionNeeded is inserted into SQLite BEFORE WebSocket broadcast | VERIFIED | approvalQueue.ts lines 26–42: `insertApproval()` called synchronously before `eventBus.emit('event', event)`; Test 6 (approval-queue.test.ts) green |
| 8 | Browser approval_decision message calls resolveApproval with the matching ID | VERIFIED | handlers.ts lines 39–47: parses `approval_decision` message type, calls `approvalQueue.decide(approvalId, decision, db)`; Test 12 (approval-queue.test.ts) green |
| 9 | approve decision updates approvals row to 'approved' and calls resolveApproval('allow') | VERIFIED | approvalQueue.ts lines 60–94: `status='approved'`, `updateApprovalDecision()`, `resolveApproval(approvalId, 'allow')`; Test 7 green |
| 10 | deny decision updates approvals row to 'denied' and calls resolveApproval('deny') | VERIFIED | approvalQueue.ts same block: `status='denied'`, `resolveApproval(approvalId, 'deny')`; Test 8 green |
| 11 | always_allow decision inserts always_allow_rules row and calls resolveApproval('allow') | VERIFIED | approvalQueue.ts lines 71–77: `insertAlwaysAllowRule()` called + `resolveApproval(approvalId, 'allow')`; Test 9 green |
| 12 | Approval timeout sets row to 'timeout' and emits approval_resolved with decision='timeout' | VERIFIED | approvalQueue.ts lines 97–126: `handleTimeout()` calls `updateApprovalDecision(db, id, 'timeout', ...)`, emits `approval_resolved` event; Tests 1+2 (approval-timeout.test.ts) green |
| 13 | All approval statuses queryable from approvals table after daemon restart | VERIFIED | approvalStore.ts `getApprovalById()` SELECT from persisted SQLite; `updateApprovalDecision()` sets `decided_at` + `decision_reason`; Tests 1–4 (approval-queue.test.ts) green |
| 14 | Daemon starts hook HTTP server on COCKPIT_HOOK_PORT (default 3002) | VERIFIED (code) | index.ts lines 13, 18–22: `HOOK_PORT=parseInt(env ?? '3002')`, `createHookServer(HOOK_PORT, ...)` called at startup; HUMAN NEEDED for runtime confirmation |
| 15 | Graceful shutdown closes hook server on SIGTERM/SIGINT | VERIFIED (code) | index.ts lines 41–48: shutdown() calls `wss.close(() => hookServer.close(() => ...db.close...))` — hook server closed before WAL checkpoint; HUMAN NEEDED for runtime confirmation |
| 16 | notificationHelpers.ts exports shouldNotifyOS() and buildNotificationPayload() | VERIFIED | notificationHelpers.ts lines 26–57: both functions fully implemented and exported; `shouldNotifyOS` returns `visibilityState === 'hidden'`; `buildNotificationPayload` returns payload for `approval_request` and `session_end`, null otherwise |
| 17 | resolveApproval on expired/unknown approvalId is a no-op (no throw) | VERIFIED | hookServer.ts lines 44–47: early return if `!pendingApprovals.get(approvalId)`; Test 15 (hook-server.test.ts) green |

**Score:** 17/17 truths verified (14 fully automated, 3 require human runtime check)

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `packages/daemon/src/adapters/claude/hookServer.ts` | VERIFIED | 160 lines; exports `createHookServer` + `resolveApproval`; full HTTP server with pending approval Map, timeout logic, envelope builders |
| `packages/daemon/src/adapters/claude/hookParser.ts` | VERIFIED | 176 lines; exports `parseHookPayload` + `HookPayload`; module-level `sessionIdCache`; handles all 8 Claude Code hook event types |
| `packages/daemon/src/adapters/claude/riskClassifier.ts` | VERIFIED | 116 lines; exports `classifyRisk` + `requiresHumanApproval`; regex-based risk rules with critical/high/medium/low priority ordering |
| `packages/daemon/src/db/database.ts` | VERIFIED | Extended `db.exec()` includes `approvals` (11 columns) and `always_allow_rules` (5 columns) tables |
| `packages/daemon/src/__tests__/hook-server.test.ts` | VERIFIED | 16 tests covering risk classification, hook parsing, HTTP server behavior, DB schema |
| `packages/daemon/src/approvals/approvalQueue.ts` | VERIFIED | 130 lines; exports `ApprovalQueue` class + `approvalQueue` singleton; `register`/`decide`/`handleTimeout` with pendingSet claim-then-act |
| `packages/daemon/src/approvals/approvalStore.ts` | VERIFIED | 107 lines; exports `insertApproval`, `getApprovalById`, `updateApprovalDecision`, `insertAlwaysAllowRule`; synchronous SQLite prepared statements |
| `packages/daemon/src/ws/handlers.ts` | VERIFIED | Lines 30–48: `ws.on('message')` handler fully implemented; parses JSON, guards type/decision, dispatches to `approvalQueue.decide()` |
| `packages/daemon/src/index.ts` | VERIFIED | Lines 4–5: imports `createHookServer` + `approvalQueue`; lines 18–22: `createHookServer` called with eventBus and approvalQueue.register callbacks; shutdown includes `hookServer.close()` |
| `packages/daemon/src/notifications/notificationHelpers.ts` | VERIFIED | 57 lines; exports `NotificationPayload` interface + `shouldNotifyOS` + `buildNotificationPayload`; pure TS with no DOM globals |
| `packages/daemon/src/__tests__/approval-timeout.test.ts` | VERIFIED | 3 integration tests covering timeout path: DB row updated to 'timeout', approval_resolved event emitted, resolveApproval called with 'deny' |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `hookServer.ts` | `hookParser.ts` | `parseHookPayload()` called in `req.on('end')` | WIRED | Line 4: import; line 103: called inside end handler |
| `hookParser.ts` | `riskClassifier.ts` | `classifyRisk()` called for PreToolUse and PermissionRequest | WIRED | Line 3: import; lines 76, 145: called for approval paths |
| `hookServer.ts` | eventBus | `onEvent` callback called for non-approval events | WIRED | Line 141: `onEvent(event)` inside non-approval branch |
| `handlers.ts` | `approvalQueue.ts` | `approvalQueue.decide()` called on approval_decision message | WIRED | Line 5: import; line 46: `approvalQueue.decide(approvalId, decision, db)` |
| `approvalQueue.ts` | `approvalStore.ts` | `insertApproval()` called synchronously BEFORE eventBus.emit | WIRED | Lines 6–8: import; line 26: `insertApproval(db, {...})` before line 42: `eventBus.emit` |
| `approvalQueue.ts` | `hookServer.ts` | `resolveApproval()` called after updating SQLite | WIRED | Line 4: import; line 94: `resolveApproval(approvalId, hookDecision)`; line 125: `resolveApproval(approvalId, 'deny', reason)` |
| `index.ts` | `hookServer.ts` | `createHookServer()` called with onEvent + onDecisionNeeded callbacks | WIRED | Line 4: import; lines 18–22: called with both callbacks |
| `index.ts` | `approvalQueue.ts` | `approvalQueue.register()` passed as onDecisionNeeded to createHookServer | WIRED | Line 5: import; line 21: `(approvalId, event) => approvalQueue.register(approvalId, event, db)` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DAEMON-04 | Plan 01 | Claude adapter ingests lifecycle hooks via HTTP hook server | SATISFIED | `hookServer.ts` + `hookParser.ts` handle all 8 Claude Code hook types; sessions tracked via UUID cache |
| APPR-01 | Plan 02 | Pending approvals visible in unified inbox | SATISFIED | `approvalQueue.register()` persists to SQLite + emits to eventBus; all pending approvals queryable via `getApprovalById` |
| APPR-02 | Plan 01 | Approvals classified by type and risk level | SATISFIED | `riskClassifier.ts` classifies all 6 action types with 4 risk levels; every approval_request carries `actionType` + `riskLevel` |
| APPR-03 | Plan 02 | Three decision types: approve, deny, always-allow | SATISFIED | `approvalQueue.decide()` handles all three; `handlers.ts` routes all three from browser WebSocket message |
| APPR-04 | Plan 02 | Approval detail persisted (proposed action, why risky, affected paths) | SATISFIED | `insertApproval()` stores all fields; `approvals` table has `proposed_action`, `why_risky`, `affected_paths`, `action_type`, `risk_level` |
| APPR-05 | Plans 02+03 | Auto-deny on timeout, unblocking agent with deny response | SATISFIED | `hookServer.ts` timer fires `buildPreToolUseEnvelope('deny', 'approval timeout')`; `approvalQueue.handleTimeout()` updates DB; Test 1 (approval-timeout) green |
| APPR-06 | Plans 02+03 | All approval decisions persisted and visible in session history | SATISFIED | `updateApprovalDecision()` sets `status`, `decided_at`, `decision_reason`; all decisions queryable; timeout path also updates row |
| NOTIF-01 | Plan 03 | In-app notifications when approval needed, session fails, completes | SATISFIED | `notificationHelpers.ts` `buildNotificationPayload()` returns payloads for `approval_request` and `session_end`; Phase 3 browser UI will use |
| NOTIF-02 | Plan 03 | OS-level notifications when tab is backgrounded | SATISFIED | `notificationHelpers.ts` `shouldNotifyOS()` returns true when `visibilityState === 'hidden'`; injectable dependency keeps it testable |

**All 9 phase requirement IDs accounted for. No orphaned requirements.**

---

## Test Suite Results

| Test File | Tests | Status |
|-----------|-------|--------|
| `hook-server.test.ts` | 16 | All pass |
| `approval-queue.test.ts` | 14 | All pass |
| `approval-timeout.test.ts` | 3 | All pass |
| `database.test.ts` | 11 | All pass |
| `ws-catchup.test.ts` | 6 | All pass |
| `events.test.ts` (shared) | 8 | All pass |
| **Total** | **58** | **58/58 pass** |

Phase 1 tests (25) remain green. No regressions.

---

## Anti-Patterns Found

None. All production files have full implementations. The one `return null` in `notificationHelpers.ts` line 56 is intentional — it signals no OS notification warranted for that event type.

---

## Human Verification Required

### 1. Daemon Startup — Hook Server on Port 3002

**Test:** Run `pnpm --filter @cockpit/daemon start` and observe stdout.
**Expected:** Two log lines appear:
- `[cockpit-daemon] Hook server listening on port 3002`
- `[cockpit-daemon] Started. DB: <path>, WS port: 3001`
**Why human:** Cannot run process and inspect stdout programmatically in this verification context.

### 2. Graceful Shutdown Sequence

**Test:** Start the daemon, then send SIGTERM (Ctrl+C or `kill <pid>`).
**Expected:** Log line `[cockpit-daemon] Shutting down...` appears and process exits with code 0. No "address in use" error on next startup.
**Why human:** Requires process lifecycle observation.

### 3. Live Claude Code Hook Integration (Optional Smoke Test)

**Test:** Configure `~/.claude/settings.json` with the hook URLs documented in Plan 03 `user_setup` frontmatter. Start a Claude Code session and issue a command that triggers a tool call.
**Expected:** Daemon stdout logs incoming hook events. Issuing a high-risk command (e.g., `rm -rf`) holds the agent until a decision is sent via WebSocket (or times out after 60s with auto-deny).
**Why human:** Requires an active Claude Code process and real HTTP hook delivery from Claude Code to the daemon.

---

## Gaps Summary

No gaps found. All automated must-haves are verified. The 3 human verification items are runtime behaviors that cannot be confirmed by static analysis — they are confirmation checkpoints, not defects. Code inspection and the 58-test suite provide high confidence that the runtime behavior will match expectations.

---

_Verified: 2026-04-05T01:58:00Z_
_Verifier: Claude (gsd-verifier)_
