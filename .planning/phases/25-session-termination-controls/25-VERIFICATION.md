---
phase: 25
status: gaps_found
verified_at: 2026-04-15
verifier: gsd-nyquist-auditor
---

# Phase 25 Verification — Session Termination Controls

## Outcome

Implementation and targeted tests confirm phase goal behavior (managed terminate works, external sessions are blocked with explicit guidance, and false-success is avoided), but traceability and one success-criteria wording mismatch leave this verification in `gaps_found`.

## Requirement Traceability (Plan Frontmatter → REQUIREMENTS)

Plan `25-01-PLAN.md` declares: `SESS-KILL-01`, `SESS-KILL-02`, `SESS-KILL-03`.

Cross-check against `.planning/REQUIREMENTS.md`:
- `SESS-KILL-01`: missing
- `SESS-KILL-02`: missing
- `SESS-KILL-03`: missing

Traceability gap: all phase requirement IDs are absent from the canonical requirements index.

## Must-Haves Check

1. Managed sessions expose `canTerminateSession=true` and can be terminated from UI: **pass**
- Daemon managed-runtime capability state: `packages/daemon/src/ws/server.ts` (`applyRuntimeCapabilityState`, lines 63-69).
- UI terminate actions: `packages/ui/src/components/layout/SessionListPanel.tsx` (lines 27-49), `packages/ui/src/components/office/InstancePopupHub.tsx` (lines 75-89), `packages/ui/src/components/sessions/SessionCard.tsx` (lines 32-84).
- Automated evidence: `pnpm --filter @cockpit/ui test --run SessionTerminateControls` (4/4 pass).

2. External sessions expose `canTerminateSession=false`; UI blocks kill with explicit reason: **pass**
- UI unsupported-state copy paths: `SessionCard.tsx` (lines 87-90), `InstancePopupHub.tsx` (lines 124-127), guard in `SessionListPanel.tsx` (lines 31-37).
- Daemon capability error path: `packages/daemon/src/ws/handlers.ts` (lines 239-247).
- Automated evidence: `SessionTerminateControls.test.tsx` unsupported scenarios pass.

3. Terminate path emits deterministic outcome (`session_end` or structured error): **pass**
- Success path emits `session_end`: `handlers.ts` (lines 259-269).
- Failure path emits structured `session_chat_error` with reason code/message: `handlers.ts` (lines 81-96, 240-255, 272-277).
- Automated evidence: `pnpm --filter @cockpit/daemon test --run session-terminate` (3/3 pass).

## Success Criteria Check (ROADMAP Phase 25)

1. UI exposes kill action from session list and popup with confirmation: **pass**
- Confirmation prompts present in list and popup terminate handlers (`SessionListPanel.tsx` line 40, `InstancePopupHub.tsx` line 83).
- UI terminate tests pass (`SessionTerminateControls`, `SessionListPanel`, `InstancePopupHub`).

2. Daemon can terminate managed Codex/Claude and emit `session_end` with reason: **gap**
- Managed terminate behavior exists and emits `session_end` (`handlers.ts` lines 259-269).
- Gap: emitted `session_end` payload does not include an explicit `reason` field.

3. Externally attached sessions are non-killable and UI explains why: **pass**
- Capability/UX gates verified in code and tests (see must-have #2).

4. Kill failures surface actionable errors and do not corrupt session state: **pass**
- Failure emits structured error with explicit code + reason; no success event emitted on failure (`handlers.ts` lines 272-277).
- Runtime unregister occurs only on successful terminate (`handlers.ts` line 261).

5. Termination behavior covered by daemon + UI tests: **pass**
- Added/targeted suites:
  - `packages/daemon/src/__tests__/session-terminate.test.ts` (3 pass)
  - `packages/ui/src/__tests__/SessionTerminateControls.test.tsx` (4 pass)
- Supporting suites run green: `ws` (11 pass), `launch-session` (14 pass), `codexAdapter` (10 pass), `SessionListPanel` (10 pass), `InstancePopupHub` (11 pass).

## Verification Commands Executed

- `pnpm --filter @cockpit/daemon test --run session-terminate` ✅
- `pnpm --filter @cockpit/ui test --run SessionTerminateControls` ✅
- `pnpm --filter @cockpit/daemon test --run ws` ✅ (required elevated run due sandbox `listen EPERM`)
- `pnpm --filter @cockpit/daemon test --run launch-session` ✅ (required elevated run due sandbox `listen EPERM`)
- `pnpm --filter @cockpit/daemon test --run codexAdapter` ✅
- `pnpm --filter @cockpit/ui test --run SessionListPanel` ✅
- `pnpm --filter @cockpit/ui test --run InstancePopupHub` ✅

## Final Status

`gaps_found`

Blocking gaps:
1. Missing requirement IDs (`SESS-KILL-01/02/03`) in `.planning/REQUIREMENTS.md`.
2. Roadmap success criterion #2 specifies `session_end` with reason, but terminate success payload omits `reason`.
