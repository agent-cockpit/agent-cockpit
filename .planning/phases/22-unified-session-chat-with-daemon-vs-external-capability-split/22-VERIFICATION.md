---
phase: 22
plan: 01
verified_on: 2026-04-14
status: gaps_found
verifier: codex
---

# Phase 22 Verification

## Scope Reviewed
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/phases/22-unified-session-chat-with-daemon-vs-external-capability-split/22-01-PLAN.md`
- `.planning/phases/22-unified-session-chat-with-daemon-vs-external-capability-split/22-01-SUMMARY.md`

## Requirement ID Cross-Reference (Plan Frontmatter -> REQUIREMENTS.md)

Plan requirement IDs:
- `CHAT-01`
- `CHAT-02`
- `CHAT-03`

Result:
- `CHAT-01` -> **not found** in `.planning/REQUIREMENTS.md`
- `CHAT-02` -> **not found** in `.planning/REQUIREMENTS.md`
- `CHAT-03` -> **not found** in `.planning/REQUIREMENTS.md`

Assessment:
- Phase roadmap and summary both claim completion of `CHAT-01/02/03`, but global requirement traceability file does not currently account for these IDs.
- This is a documentation/traceability gap and blocks a full `passed` sign-off.

## Must-Haves and Success Criteria Verification

### 1) Popup includes Chat tab scoped to selected session
- Verified in `packages/ui/src/components/office/InstancePopupHub.tsx` (`chat` tab + `ChatPanel` content).
- Verified in `packages/ui/src/components/panels/ChatPanel.tsx` (session scope via route/store selected session ID).
- Automated evidence: `packages/ui/src/components/office/__tests__/InstancePopupHub.test.tsx` includes Chat tab and ChatPanel rendering test.
- **Result: passed**

### 2) Daemon-managed sessions expose `canSendMessage=true`
- Verified in daemon capability modeling and runtime application:
  - `packages/daemon/src/db/queries.ts`
  - `packages/daemon/src/ws/server.ts`
  - `packages/daemon/src/adapters/codex/codexAdapter.ts`
  - `packages/daemon/src/adapters/claude/hookParser.ts`
  - `packages/daemon/src/adapters/claude/hookServer.ts`
- Automated evidence:
  - `packages/daemon/src/__tests__/ws-capabilities.test.ts`
  - `packages/daemon/src/__tests__/ws-chat.test.ts`
- **Result: passed**

### 3) Externally attached sessions expose `canSendMessage=false` + explicit approval-only UI
- Verified in daemon capability inference and explicit reason string:
  - `packages/daemon/src/db/queries.ts` (`EXTERNAL_SESSION_REASON`)
- Verified in UI disabled state and reason rendering:
  - `packages/ui/src/components/panels/ChatPanel.tsx`
- Automated evidence:
  - `packages/daemon/src/__tests__/ws-capabilities.test.ts`
  - `packages/ui/src/__tests__/ChatPanel.test.tsx`
- **Result: passed**

### 4) Blocked sends fail safely with user-visible reason
- Verified in WS handler guard + structured error event:
  - `packages/daemon/src/ws/handlers.ts` emits `session_chat_error` with `reasonCode` and `reason`.
- Verified in UI surface path:
  - `packages/ui/src/components/panels/ChatPanel.tsx` shows latest `session_chat_error.reason`.
- Automated evidence:
  - `packages/daemon/src/__tests__/ws-chat.test.ts`
  - `packages/ui/src/__tests__/ChatPanel.test.tsx`
- **Result: passed**

### 5) Capability state available to Ops/map popup flows
- Capability fields are present in shared session state contract and session reducer:
  - `packages/ui/src/store/index.ts`
  - `packages/ui/src/store/sessionsSlice.ts`
- Popup consumes this state through selected session:
  - `packages/ui/src/components/office/InstancePopupHub.tsx`
  - `packages/ui/src/components/panels/ChatPanel.tsx`
- **Result: passed (code-path evidence)**

## Automated Verification Runs (Executed)

Commands run:
- `pnpm --filter @cockpit/daemon test --run ws-chat`
- `pnpm --filter @cockpit/daemon test --run ws-capabilities`
- `pnpm --filter @cockpit/daemon test --run codexAdapter`
- `pnpm --filter @cockpit/ui test --run ChatPanel`
- `pnpm --filter @cockpit/ui test --run InstancePopupHub`

Outcome:
- All above commands passed in this workspace on 2026-04-14.

## Human Verification Checklist (Recommended)

Even with passing automated tests, run this manual pass on macOS/Linux for runtime-level confidence:
- [ ] Launch a daemon-managed session from UI, open popup Chat tab, send a message, verify send succeeds and appears in chat history.
- [ ] Attach an externally started session, open popup Chat tab, verify composer is hidden/disabled and approval-only guidance is visible.
- [ ] Attempt blocked send (e.g., crafted `session_chat` for external session) and verify visible `session_chat_error` reason in Chat panel.
- [ ] Verify capability truth remains consistent when switching between map popup and ops/session selection flows.

## Final Verdict

`gaps_found`

Reason:
- Functional behavior for phase goal is implemented and test-backed.
- However, requirement traceability is incomplete: `CHAT-01`, `CHAT-02`, and `CHAT-03` are not accounted for in `.planning/REQUIREMENTS.md`.
