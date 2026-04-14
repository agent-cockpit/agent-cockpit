# Phase 23 — Research

## Objective
Stabilize approval handling across Claude and Codex so every approval request resolves exactly once, with correct persistence and replay, including subagent-adjacent flows.

## Current Findings
- Claude approval lifecycle is split across `hookParser.ts`, `hookServer.ts`, and `approvalQueue.ts`.
- Codex approval lifecycle is split across `codexAdapter.ts` and `approvalQueue.ts` with a module-level resolver map.
- UI convergence for approvals depends on `approval_request` + `approval_resolved` ordering and de-dup logic in `approvalsSlice.ts`.
- Subagent lifecycle events (`subagent_spawn`, `subagent_complete`) already exist but need regression coverage with concurrent approval events.

## Known Risk Areas
1. Double-resolution race (manual decision vs timeout).
2. Process-exit cleanup path dropping pending approvals.
3. Replay after reconnect creating stale pending cards in UI.
4. Provider-specific hook/event envelope differences.

## Recommended Direction
1. Build explicit test matrix first for PreToolUse, PermissionRequest, Codex requestApproval, timeout, and duplicate decision.
2. Harden queue-level idempotency guarantees and provider dispatch no-op semantics.
3. Ensure `approval_resolved` is always emitted/persisted for terminal approval states.
4. Validate UI replay behavior with out-of-order catch-up sets.

## Validation Architecture
- Fast loop:
  - `pnpm --filter @cockpit/daemon test --run hookParser`
  - `pnpm --filter @cockpit/daemon test --run hook-server`
  - `pnpm --filter @cockpit/daemon test --run approval-queue`
- Provider coverage:
  - `pnpm --filter @cockpit/daemon test --run codexAdapter`
- UI convergence:
  - `pnpm --filter @cockpit/ui test --run approvalsSlice`

