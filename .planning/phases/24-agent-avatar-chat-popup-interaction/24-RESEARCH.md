# Phase 24 — Research

## Objective
Make avatar click interaction deterministic and chat-first by opening the exact session popup directly in the Chat tab.

## Current Findings
- `OfficePage.tsx` performs canvas hit-testing and opens `InstancePopupHub` via `setSessionDetailOpen(true)` + `selectSession(sessionId)`.
- `InstancePopupHub.tsx` currently defaults to `approvals` tab and has no `chat` tab.
- Store state tracks selected session and active panel but not explicit popup default tab semantics per open origin.

## Risks
1. Regressing existing tab flows when popup opened from non-avatar paths.
2. Race between session selection and tab activation on rapid consecutive clicks.
3. Hitbox overlap edge cases selecting wrong session.

## Recommended Direction
1. Add chat tab identity to popup tab system.
2. Add explicit popup-open context (origin) or a one-shot preferred tab signal.
3. On avatar click, set selected session then set preferred tab to chat before opening.
4. Add tests for rapid click switching and non-avatar opening path regression.

## Validation Architecture
- `pnpm --filter @cockpit/ui test --run OfficePage`
- `pnpm --filter @cockpit/ui test --run InstancePopupHub`
- `pnpm --filter @cockpit/ui test --run SessionListPanel`

