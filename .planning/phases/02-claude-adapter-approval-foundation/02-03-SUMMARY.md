---
phase: 02-claude-adapter-approval-foundation
plan: 03
subsystem: daemon
tags: [vitest, typescript, sqlite, websocket, notifications, hooks]

# Dependency graph
requires:
  - phase: 02-claude-adapter-approval-foundation/02-01
    provides: hookServer.ts with createHookServer/resolveApproval
  - phase: 02-claude-adapter-approval-foundation/02-02
    provides: ApprovalQueue with register/decide/handleTimeout, approvalStore CRUD
provides:
  - Daemon entrypoint wired with hook server on COCKPIT_HOOK_PORT (default 3002)
  - Graceful shutdown includes hookServer.close before WAL checkpoint
  - 3 approval timeout integration tests (APPR-05 automated proof)
  - Browser-side notification helpers: shouldNotifyOS, buildNotificationPayload
affects:
  - phase-03-browser-ui-shell (imports notificationHelpers, connects to hook server)
  - phase-04-codex-adapter (shares daemon wiring pattern)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Daemon startup order: openDatabase → createHookServer → createWsServer
    - Shutdown order: terminate WS clients → close wss → hookServer.close → WAL checkpoint → db.close → httpServer.close → exit 0
    - Notification helpers are pure TS (no DOM globals) enabling Node testability

key-files:
  created:
    - packages/daemon/src/__tests__/approval-timeout.test.ts
    - packages/daemon/src/notifications/notificationHelpers.ts
  modified:
    - packages/daemon/src/index.ts

key-decisions:
  - "Hook server started before WS server — both depend on DB but hook server has no dependency on WS"
  - "hookServer.close() called before WAL checkpoint to stop incoming hooks before DB closes"
  - "Notification helpers use injected visibilityState to remain testable outside browser"

patterns-established:
  - "Pure helper modules with injected dependencies — no globals, testable in Node"
  - "Shutdown sequence documented in shutdown() function comments for future maintainers"

requirements-completed: [APPR-05, APPR-06, NOTIF-01, NOTIF-02]

# Metrics
duration: 8min
completed: 2026-04-05
---

# Phase 2 Plan 03: Daemon Wiring + Notification Helpers Summary

**Hook server wired into daemon entrypoint on port 3002, approval timeout tests added (APPR-05/06 proof), and pure-TS browser notification helpers exported for Phase 3 UI**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-05T01:48:00Z
- **Completed:** 2026-04-05T01:56:00Z
- **Tasks:** 2 of 3 (Task 3 is checkpoint:human-verify)
- **Files modified:** 3

## Accomplishments
- Wired `createHookServer` into `index.ts` — daemon now starts hook server on COCKPIT_HOOK_PORT (default 3002) with correct event bus and approval queue callbacks
- Added graceful shutdown for hook server (closed before WAL checkpoint and DB)
- Created 3 integration tests for `ApprovalQueue.handleTimeout`: DB row status set to 'timeout', eventBus emits approval_resolved with decision='timeout', resolveApproval called with 'deny'
- Created `notificationHelpers.ts` exporting `shouldNotifyOS` and `buildNotificationPayload` — pure TS, no DOM globals

## Task Commits

Each task was committed atomically:

1. **Task 1: Approval timeout integration test + daemon wiring** - `5ced014` (feat)
2. **Task 2: Browser notification helpers** - `5ba0816` (feat)

_Task 3 is checkpoint:human-verify — paused for human verification._

## Files Created/Modified
- `packages/daemon/src/index.ts` - Added hook server wiring, COCKPIT_HOOK_PORT env var, updated shutdown sequence
- `packages/daemon/src/__tests__/approval-timeout.test.ts` - 3 timeout integration tests
- `packages/daemon/src/notifications/notificationHelpers.ts` - NotificationPayload interface, shouldNotifyOS, buildNotificationPayload

## Decisions Made
- Hook server started after `openDatabase` but before `createWsServer` — hook server needs DB access (via approvalQueue.register callback) but has no WS dependency
- `hookServer.close()` placed before WAL checkpoint in shutdown to ensure no new hook events arrive while DB is checkpointing
- Notification helpers receive `visibilityState` as a parameter (not reading `document.visibilityState` directly) — keeps module Node-testable and free from DOM globals

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — all 58 tests passed immediately after implementation.

## User Setup Required

**External services require manual configuration.** Configure `~/.claude/settings.json` with hook URLs:

```json
{
  "hooks": {
    "PreToolUse": [{ "matcher": "", "hooks": [{ "type": "http", "url": "http://localhost:3002/hook", "timeout": 300 }] }],
    "PermissionRequest": [{ "matcher": "", "hooks": [{ "type": "http", "url": "http://localhost:3002/hook", "timeout": 300 }] }],
    "SessionStart": [{ "matcher": "", "hooks": [{ "type": "http", "url": "http://localhost:3002/hook", "timeout": 30 }] }],
    "SessionEnd": [{ "matcher": "", "hooks": [{ "type": "http", "url": "http://localhost:3002/hook", "timeout": 30 }] }],
    "PostToolUse": [{ "matcher": "", "hooks": [{ "type": "http", "url": "http://localhost:3002/hook", "timeout": 30 }] }],
    "SubagentStart": [{ "matcher": "", "hooks": [{ "type": "http", "url": "http://localhost:3002/hook", "timeout": 30 }] }],
    "SubagentStop": [{ "matcher": "", "hooks": [{ "type": "http", "url": "http://localhost:3002/hook", "timeout": 30 }] }],
    "Notification": [{ "matcher": "", "hooks": [{ "type": "http", "url": "http://localhost:3002/hook", "timeout": 30 }] }]
  }
}
```

PreToolUse and PermissionRequest use `timeout: 300` (5 minutes) — Claude Code waits for a human decision; the daemon auto-denies after 60 seconds.

## Next Phase Readiness
- Task 3 checkpoint:human-verify pending — verify test suite (58 tests green) and daemon starts with hook server on port 3002
- After verification, Phase 2 is complete and Phase 3 (browser UI shell) can begin
- notificationHelpers.ts is ready for Phase 3 to import and use

---
*Phase: 02-claude-adapter-approval-foundation*
*Completed: 2026-04-05*
