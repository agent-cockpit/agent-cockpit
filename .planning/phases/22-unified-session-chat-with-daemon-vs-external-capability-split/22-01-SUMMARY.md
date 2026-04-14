---
phase: 22-unified-session-chat-with-daemon-vs-external-capability-split
plan: 01
subsystem: ui-api
tags: [websocket, session-chat, capabilities, zustand, daemon]
requires:
  - phase: 16.12-provider-native-session-launch-claude-codex
    provides: provider runtime launch and live session lifecycle events
provides:
  - session capability contract for managed vs external sessions
  - websocket session_chat dispatch with capability guard
  - popup Chat tab with capability-gated composer and rejection messaging
affects: [office-popup, timeline-replay, daemon-ws, session-history]
tech-stack:
  added: []
  patterns: [runtime-registry-by-session-id, normalized-chat-events, capability-gated-ui]
key-files:
  created:
    - packages/daemon/src/__tests__/ws-capabilities.test.ts
    - packages/daemon/src/__tests__/ws-chat.test.ts
    - packages/ui/src/__tests__/ChatPanel.test.tsx
    - packages/ui/src/components/panels/ChatPanel.tsx
  modified:
    - packages/daemon/src/ws/server.ts
    - packages/daemon/src/ws/handlers.ts
    - packages/daemon/src/db/queries.ts
    - packages/daemon/src/adapters/codex/codexAdapter.ts
    - packages/daemon/src/adapters/claude/claudeLauncher.ts
    - packages/daemon/src/adapters/claude/hookParser.ts
    - packages/daemon/src/adapters/claude/hookServer.ts
    - packages/shared/src/events.ts
    - packages/shared/src/index.ts
    - packages/ui/src/store/index.ts
    - packages/ui/src/store/sessionsSlice.ts
    - packages/ui/src/components/office/InstancePopupHub.tsx
    - packages/ui/src/components/office/__tests__/InstancePopupHub.test.tsx
key-decisions:
  - "Session capabilities are explicit (`managedByDaemon`, `canSendMessage`, `canTerminateSession`, optional `reason`) and flow through both daemon summaries and live session_start events."
  - "session_chat uses normalized events (`session_chat_message`, `session_chat_error`) so send outcomes are replay-safe and UI-visible."
  - "WebSocket handlers dispatch through a runtime registry keyed by sessionId, avoiding provider-specific branching in UI."
patterns-established:
  - "Capability truth is daemon-authoritative; UI only reads and enforces capability flags."
  - "Blocked chat sends emit structured error events instead of silent no-ops."
requirements-completed: [CHAT-01, CHAT-02, CHAT-03]
duration: 20 min
completed: 2026-04-14
---

# Phase 22 Plan 01: Unified Session Chat with Daemon vs External Capability Split Summary

**Popup chat now supports managed-session sends while external sessions remain approval-only, enforced by daemon capability guards and normalized chat/error events.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-04-14T11:07:30Z
- **Completed:** 2026-04-14T11:27:38Z
- **Tasks:** 3
- **Files modified:** 17

## Accomplishments
- Added a daemon capability contract with runtime-aware session summaries and managed runtime registry keyed by `sessionId`.
- Implemented `session_chat` dispatch with blocked/allowed/error paths and normalized event emission for replay/UI.
- Added popup `Chat` tab and `ChatPanel` with capability-gated composer, history rendering, and explicit rejection messaging.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add session capability contract and managed runtime registry in daemon**
   - `ff5aa04` (`test`) RED: failing capability contract tests
   - `a20bc13` (`feat`) GREEN: capability metadata + runtime registry implementation
2. **Task 2: Implement `session_chat` dispatch with capability guard**
   - `b6400d2` (`test`) RED: failing ws-chat dispatch tests
   - `308ab41` (`feat`) GREEN: ws handler dispatch + normalized chat/error events
3. **Task 3: Add Chat tab and capability-gated composer in popup**
   - `ef50fd7` (`test`) RED: failing ChatPanel + popup chat tab tests
   - `56fb0c6` (`feat`) GREEN: ChatPanel, popup tab wiring, and capability propagation

## Files Created/Modified
- `packages/daemon/src/__tests__/ws-capabilities.test.ts` - capability contract tests for managed/external sessions.
- `packages/daemon/src/__tests__/ws-chat.test.ts` - deterministic blocked/allowed ws chat dispatch tests.
- `packages/daemon/src/ws/handlers.ts` - `session_chat` handling, guard logic, normalized error/message emission.
- `packages/daemon/src/ws/server.ts` - ws handler dependency wiring with runtime registry + persisted broadcast callback.
- `packages/daemon/src/db/queries.ts` - session capability model in summaries with managed/external inference.
- `packages/shared/src/events.ts` - `session_chat_message` and `session_chat_error` schemas (+ optional session_start capabilities).
- `packages/ui/src/components/panels/ChatPanel.tsx` - popup chat history + composer + explicit disabled states.
- `packages/ui/src/components/office/InstancePopupHub.tsx` - new `Chat` tab integration.
- `packages/ui/src/store/sessionsSlice.ts` - capability and chat-error reason propagation into session records.

## Decisions Made
- Used normalized chat events in the same stream as other timeline/replay events instead of ad-hoc WS response payloads.
- Kept gating daemon-side first, then surfaced reason text in UI to avoid mismatched client-side assumptions.
- Used runtime-registry lookup at send time to keep provider-specific send behavior behind a sessionId abstraction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added capability fields to live Claude/Codex session_start emissions**
- **Found during:** Task 3 (popup chat UX gating)
- **Issue:** Capability truth was present in summaries but not consistently in live `session_start` events, causing potential UI drift.
- **Fix:** Added capability flags/reason to Codex `session_start` and Claude hook/synthetic `session_start` events.
- **Files modified:** `packages/daemon/src/adapters/codex/codexAdapter.ts`, `packages/daemon/src/adapters/claude/hookParser.ts`, `packages/daemon/src/adapters/claude/hookServer.ts`
- **Verification:** UI chat tests + daemon ws-chat tests + codexAdapter tests all pass.
- **Committed in:** `56fb0c6`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Required for capability consistency between daemon and popup UI; no scope creep beyond planned behavior.

## Issues Encountered
- Local sandbox blocks socket `listen` calls (`EPERM`) for ws-suite verification; reran the ws verification command with escalation and validated green.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Chat capability split is now deterministic and test-covered across daemon and popup UI.
- Ready for follow-on phases that depend on reliable session capability truth (approval reliability, avatar chat interaction, session termination controls).

## Self-Check: PASSED
- Found summary file at `.planning/phases/22-unified-session-chat-with-daemon-vs-external-capability-split/22-01-SUMMARY.md`.
- Verified task commits exist: `ff5aa04`, `a20bc13`, `b6400d2`, `308ab41`, `ef50fd7`, `56fb0c6`.

---
*Phase: 22-unified-session-chat-with-daemon-vs-external-capability-split*
*Completed: 2026-04-14*
