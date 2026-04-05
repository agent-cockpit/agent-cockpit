---
phase: 02-claude-adapter-approval-foundation
plan: 01
subsystem: adapter
tags: [claude-code, hooks, http-server, sqlite, risk-classification, tdd, typescript]

# Dependency graph
requires:
  - phase: 01-01
    provides: "@cockpit/shared NormalizedEvent Zod schema and TypeScript type"
  - phase: 01-02
    provides: "openDatabase() SQLite persistence layer"
  - phase: 01-03
    provides: "eventBus typed DaemonEventBus for adapter → broadcast pipeline"
provides:
  - createHookServer() — HTTP server that holds response for approval hooks
  - resolveApproval() — closes held HTTP response with permissionDecision envelope
  - parseHookPayload() — maps all Claude Code hook types to NormalizedEvent
  - classifyRisk() + requiresHumanApproval() — derives actionType + riskLevel from tool_name + tool_input
  - openDatabase() extended with approvals + always_allow_rules tables
affects:
  - Phase 02-02 (approval round-trip): consumes createHookServer + resolveApproval
  - Phase 03 (browser UI): approval_request events arrive via eventBus → broadcast

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Module-level Map for session ID cache (Claude session_id → UUID, persistent across calls)
    - Module-level Map for pending approvals (approvalId → {res, timer, hookEventName})
    - Claim-then-act pattern for resolveApproval: delete from Map first, then write response
    - Regex-based risk classification with priority order: critical > high > medium > low
    - IncomingMessage must be in flowing mode (res.resume()) for end event to fire in Node.js HTTP client

key-files:
  created:
    - packages/daemon/src/adapters/claude/riskClassifier.ts
    - packages/daemon/src/adapters/claude/hookParser.ts
    - packages/daemon/src/adapters/claude/hookServer.ts
    - packages/daemon/src/__tests__/hook-server.test.ts
  modified:
    - packages/daemon/src/db/database.ts

key-decisions:
  - "Session ID cache is module-level Map: same Claude session_id always maps to same UUID across calls — module singleton ensures no re-keying between hook payloads in the same process"
  - "Claim-then-act for resolveApproval: delete from pendingApprovals before calling res.end() — prevents double-write if a race condition fires timeout and explicit resolve simultaneously"
  - "Bash risk classification priority: critical (rm -rf, sudo, chmod 777, pipe-to-shell) > high (curl, wget, ssh, git push, npm publish) > medium (generic shell) — WebFetch/WebSearch are medium mcp_tool_call, not high network_access, to avoid over-blocking"
  - "res.resume() required in Node.js HTTP test clients: IncomingMessage starts in paused mode; without resume(), the 'end' event never fires and the test hangs"

patterns-established:
  - "Hook adapter pattern: parse → classify → emit or hold (parseHookPayload returns requiresApproval flag)"
  - "Approval hold pattern: store ServerResponse in Map with timeout; resolveApproval writes envelope and ends response"
  - "Risk classification pattern: tool-specific rules first, then regex patterns, then MCP fallback"

requirements-completed: [DAEMON-04, APPR-02]

# Metrics
duration: 8min
completed: 2026-04-05
---

# Phase 02 Plan 01: Claude Code Hook Adapter Summary

**HTTP hook server that ingests all Claude Code lifecycle events, classifies tool-call risk, holds HTTP responses for high-risk approvals, and extends SQLite schema with approvals + always_allow_rules tables**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-05T04:39:51Z
- **Completed:** 2026-04-05T04:47:42Z
- **Tasks:** 2 (RED + GREEN, TDD)
- **Files modified:** 5

## Accomplishments

- `riskClassifier.ts`: `classifyRisk()` maps tool_name + tool_input to actionType/riskLevel/whyRisky with Bash regex heuristics; `requiresHumanApproval()` returns true for high/critical risk
- `hookParser.ts`: `parseHookPayload()` handles all 8 Claude Code hook types (SessionStart/End, PreToolUse, PostToolUse, SubagentStart/Stop, PermissionRequest, Notification) mapping to NormalizedEvent; module-level session ID cache ensures UUID stability across calls
- `hookServer.ts`: `createHookServer()` holds HTTP response for approval hooks (does not call res.end); `resolveApproval()` closes held response with correct PreToolUse or PermissionRequest envelope; timeouts auto-deny after COCKPIT_APPROVAL_TIMEOUT_MS (default 60s)
- `database.ts`: extended schema with `approvals` (11 columns) and `always_allow_rules` (5 columns) tables
- All 41 tests pass: 16 new hook-server tests + 25 existing Phase 1 tests

## Task Commits

Each task was committed atomically:

1. **RED: failing Claude hook adapter tests** - `6ff1c6f` (test)
2. **GREEN: hook adapter implementation** - `6ea65e1` (feat)

## Files Created/Modified

- `packages/daemon/src/adapters/claude/riskClassifier.ts` — `classifyRisk()` and `requiresHumanApproval()` exports
- `packages/daemon/src/adapters/claude/hookParser.ts` — `parseHookPayload()` with session ID cache
- `packages/daemon/src/adapters/claude/hookServer.ts` — `createHookServer()` and `resolveApproval()` exports
- `packages/daemon/src/__tests__/hook-server.test.ts` — 16 TDD tests (4 risk classification + 7 parse + 4 HTTP server + 1 DB schema)
- `packages/daemon/src/db/database.ts` — extended db.exec() with approvals + always_allow_rules CREATE TABLE statements

## Decisions Made

- Session ID cache is module-level Map: ensures same Claude session_id always maps to same UUID within the daemon process lifetime — critical for correlating PreToolUse events with their SessionStart
- Claim-then-act for resolveApproval: `pendingApprovals.delete(approvalId)` before `res.end()` prevents double-write if timeout fires simultaneously with an explicit resolve call
- Bash critical/high/medium priority ordering chosen to match developer expectations: explicit destructive commands are critical, network exfiltration is high, generic shell is medium
- `res.resume()` added to test HTTP client to put IncomingMessage in flowing mode — without it, Node.js HTTP response never emits 'end', causing Test 13 to hang until timeout

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added res.resume() to Test 13 HTTP client to fix response end event**
- **Found during:** GREEN phase (Test 13: "High-risk Bash PreToolUse calls onDecisionNeeded and does NOT close response")
- **Issue:** Test 13 timed out (5000ms Vitest default). The `http.request()` response callback sets up a listener on `res.on('end', ...)`, but Node.js `IncomingMessage` starts in paused mode. Without consuming the response body or calling `res.resume()`, the `end` event never fires and the `await responsePromise` hangs forever.
- **Fix:** Added `res.resume()` immediately inside the response callback to put `IncomingMessage` into flowing mode, allowing the `end` event to fire once the server closes the response via `resolveApproval()`.
- **Files modified:** `packages/daemon/src/__tests__/hook-server.test.ts`
- **Verification:** Test 13 now passes in ~100ms; full suite 41/41 green
- **Committed in:** `6ea65e1` (GREEN task commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Correctness fix in test code only — the implementation was correct, the test needed the `res.resume()` call to match Node.js HTTP client semantics. No behavior change to production code.

## Issues Encountered

None beyond the Test 13 res.resume() fix documented above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 02-01 is complete: risk classifier, hook parser, HTTP hook server, and extended DB schema are all ready
- `createHookServer()` and `resolveApproval()` are ready for Phase 02-02 (approval round-trip: WebSocket forwarding + UI decision → resolveApproval)
- The daemon's index.ts can wire up `createHookServer` with the `eventBus` to start receiving Claude Code events
- Full test suite (41 tests) is green — no blockers

---

*Phase: 02-claude-adapter-approval-foundation*
*Completed: 2026-04-05*
