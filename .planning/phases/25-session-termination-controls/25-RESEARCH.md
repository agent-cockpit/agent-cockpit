# Phase 25 — Research

## Objective
Provide explicit session kill controls with provider-aware capability gating and reliable lifecycle outcomes.

## Current Findings
- Daemon has launch flow for managed sessions but no explicit terminate API/WS action.
- `CodexAdapter` already has `stop()` and process handle lifecycle.
- Claude launch currently detaches process but lacks runtime registry for targeted termination.
- UI has session surfaces in `SessionListPanel`, `SessionCard`, and popup header where kill actions can be placed.

## Risks
1. Terminating wrong process/session due missing runtime registry.
2. External/attached sessions showing kill success despite being unmanaged.
3. Session state corruption if kill fails mid-path.

## Recommended Direction
1. Introduce managed runtime registry with capability metadata (`canTerminateSession`).
2. Add `session_terminate` WS action (or HTTP endpoint) with structured success/failure payload.
3. Guarantee termination emits terminal lifecycle event (`session_end`) or explicit error outcome.
4. Gate UI affordances strictly by capability and show unsupported-state copy for external sessions.

## Validation Architecture
- `pnpm --filter @cockpit/daemon test --run ws`
- `pnpm --filter @cockpit/daemon test --run launch-session`
- `pnpm --filter @cockpit/daemon test --run codexAdapter`
- `pnpm --filter @cockpit/ui test --run SessionListPanel`
- `pnpm --filter @cockpit/ui test --run InstancePopupHub`

