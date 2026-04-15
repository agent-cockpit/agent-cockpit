---
phase: 25-session-termination-controls
plan: 01
subsystem: session-management
tags: [websocket, terminate, capability-gating, vitest]
requires:
  - phase: 22-01
    provides: daemon-managed capability metadata in session summaries
  - phase: 23-01
    provides: reliable approval/runtime event handling across providers
provides:
  - session_terminate websocket dispatch with capability/runtime guards
  - provider stop path hardening for repeated and late terminate requests
  - capability-aware terminate controls in session list and popup surfaces
affects: [phase-26-agent-face-cards-sidebar, ops-session-ui, popup-hub]
tech-stack:
  added: []
  patterns: [capability-gated UI actions, deterministic terminate outcome contract]
key-files:
  created: [packages/daemon/src/__tests__/session-terminate.test.ts, packages/ui/src/__tests__/SessionTerminateControls.test.tsx]
  modified: [packages/daemon/src/ws/handlers.ts, packages/daemon/src/ws/server.ts, packages/daemon/src/adapters/codex/codexAdapter.ts, packages/daemon/src/adapters/claude/claudeLauncher.ts, packages/ui/src/components/layout/SessionListPanel.tsx, packages/ui/src/components/office/InstancePopupHub.tsx, packages/ui/src/components/sessions/SessionCard.tsx]
key-decisions:
  - "Structured terminate failures emit session_chat_error with explicit reason codes/messages so existing UI error plumbing can surface failures immediately."
  - "Successful session_terminate emits session_end directly from websocket handler and unregisters runtime for deterministic lifecycle closure."
patterns-established:
  - "Terminate controls only render for active sessions with canTerminateSession=true."
  - "Terminate actions require user confirmation and expose in-flight plus explicit error text."
requirements-completed: [SESS-KILL-01, SESS-KILL-02, SESS-KILL-03]
duration: 26 min
completed: 2026-04-15
---

# Phase 25 Plan 01: Session Termination Controls Summary

**Capability-gated session termination now works end-to-end, with deterministic daemon outcomes for managed sessions and explicit unsupported/error UX for external sessions.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-04-15T12:32:16Z
- **Completed:** 2026-04-15T12:58:15Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments
- Added daemon `session_terminate` websocket handling with strict capability checks and runtime-availability guards.
- Hardened Codex and Claude stop paths so late/repeated terminate requests are safe and idempotent.
- Added terminate controls in both session list and popup with confirmation, in-flight state, and unsupported-session guidance.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add managed runtime termination contract in daemon**
   - `d6a6a0a` (`test`): failing terminate dispatch tests
   - `556935b` (`feat`): `session_terminate` handler + deterministic outcomes
2. **Task 2: Wire provider-specific stop behavior safely**
   - `5656032` (`test`): failing stop-resilience tests
   - `e1bb5c9` (`fix`): idempotent/safe provider stop handling
3. **Task 3: Add capability-aware kill controls in UI surfaces**
   - `0f97bc0` (`test`): terminate UI control coverage
   - `d28a264` (`feat`): session list + popup terminate actions and state handling

## Files Created/Modified
- `packages/daemon/src/__tests__/session-terminate.test.ts` - daemon terminate dispatch coverage
- `packages/daemon/src/ws/handlers.ts` - `session_terminate` handling and deterministic emit path
- `packages/daemon/src/ws/server.ts` - runtime unregister wiring for terminate flow
- `packages/daemon/src/adapters/codex/codexAdapter.ts` - resilient stop cleanup
- `packages/daemon/src/adapters/claude/claudeLauncher.ts` - idempotent terminate for exited process
- `packages/ui/src/components/layout/SessionListPanel.tsx` - terminate action dispatch + list-level states
- `packages/ui/src/components/office/InstancePopupHub.tsx` - popup header terminate action + error display
- `packages/ui/src/components/sessions/SessionCard.tsx` - terminate affordance/unsupported guidance rendering
- `packages/ui/src/__tests__/SessionTerminateControls.test.tsx` - managed vs external terminate UX assertions

## Decisions Made
- Reused existing `session_chat_error` pipeline for terminate failures so UI state/error handling remains centralized.
- Emitted `session_end` immediately on successful terminate request to avoid false-success limbo.
- Standardized external capability reason text to cover both chat and terminate actions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] External capability reason was chat-only and misleading for terminate UX**
- **Found during:** Task 1
- **Issue:** External-session reason text only referenced chat send, causing terminate UX copy mismatch.
- **Fix:** Normalized reason text across daemon capability producers/consumers and related tests.
- **Files modified:** `packages/daemon/src/db/queries.ts`, `packages/daemon/src/adapters/claude/hookParser.ts`, `packages/daemon/src/adapters/claude/hookServer.ts`, related tests.
- **Verification:** `pnpm --filter @cockpit/daemon test --run ws` and UI terminate tests.
- **Committed in:** `556935b`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Correctness-only adjustment; no scope creep.

## Issues Encountered
- Daemon socket-based test suites (`ws`, `launch-session`) require local port binding not allowed in sandbox. Re-ran these verification commands with elevated permissions; all passed.

## Authentication Gates
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 25 requirements are implemented and verified.
- Ready for Phase 26 work to build on terminate-capable session surfaces.

---
*Phase: 25-session-termination-controls*
*Completed: 2026-04-15*

## Self-Check: PASSED
- FOUND: `.planning/phases/25-session-termination-controls/25-01-SUMMARY.md`
- FOUND: `d6a6a0a`
- FOUND: `556935b`
- FOUND: `5656032`
- FOUND: `e1bb5c9`
- FOUND: `0f97bc0`
- FOUND: `d28a264`
