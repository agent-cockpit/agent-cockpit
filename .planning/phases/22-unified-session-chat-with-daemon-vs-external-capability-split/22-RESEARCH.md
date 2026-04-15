# Phase 22 — Research

## Objective
Plan a unified session chat flow with explicit capability split between daemon-managed and externally attached sessions.

## Current Codebase Findings

### Daemon transport and control surface
- `packages/daemon/src/ws/handlers.ts` currently accepts only `approval_decision` over WebSocket.
- `packages/daemon/src/ws/server.ts` exposes session/memory/search HTTP endpoints, but no chat-send or terminate-session endpoint yet.
- `packages/daemon/src/adapters/codex/codexAdapter.ts` already has a live stdin write path and JSON-RPC request plumbing, which is the best insertion point for managed-session chat send.
- `packages/daemon/src/adapters/claude/claudeLauncher.ts` launches detached via PTY wrapper and does not currently keep a process registry for subsequent interaction.

### Shared event schema
- `packages/shared/src/events.ts` does not include chat message event types yet.
- Existing event model already supports replay and timeline persistence, so chat can reuse the same persistence path once modeled as normalized events.

### UI state and popup model
- `packages/ui/src/components/office/InstancePopupHub.tsx` has tabs: approvals/timeline/diff/memory/artifacts.
- `packages/ui/src/store/index.ts` tracks panel state and session selection but has no capability model per session.
- `packages/ui/src/hooks/useSessionEvents.ts` has generic WS send helper (`sendWsMessage`) and can carry new message types once daemon supports them.

## Constraints and Design Requirements
- Capability split must be explicit and deterministic:
  - managed by daemon: chat send allowed
  - external/attached sessions: approval-only, chat send blocked with reason
- No silent failure path for blocked chat sends.
- Popup click flows from map and ops must show the same capability truth.

## Recommended Technical Direction
1. Add daemon-managed session runtime registry (`sessionId -> provider runtime + capabilities`).
2. Introduce explicit session capability shape returned in session list and synchronized in WS bootstrap/replay path.
3. Add a `session_chat` WS message type with strict capability checks and structured error responses.
4. Add normalized chat events in shared schema for timeline and chat history rendering.
5. Add Chat tab + `ChatPanel` in popup, including disabled composer state when `canSendMessage=false`.

## Risks
- Claude managed input path may require terminal-mode specifics beyond current launcher behavior.
- Codex RPC method for “message send” must match app-server contract and be tested against malformed payloads.
- Capability truth must not drift between daemon memory, DB snapshots, and UI state.

## Validation Architecture
- Test runner: `vitest`
- Fast loop commands:
  - `pnpm --filter @cockpit/daemon test --run ws`
  - `pnpm --filter @cockpit/daemon test --run codexAdapter`
  - `pnpm --filter @cockpit/ui test --run InstancePopupHub`
  - `pnpm --filter @cockpit/ui test --run useSessionEvents`
- Full phase gate:
  - `pnpm --filter @cockpit/daemon test`
  - `pnpm --filter @cockpit/ui test`

