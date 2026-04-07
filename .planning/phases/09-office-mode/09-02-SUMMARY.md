---
phase: 09-office-mode
plan: "02"
subsystem: ui
tags: [tdd, office-mode, dnd-kit, radix-hover-card, agent-sprite, hover-card]
dependency_graph:
  requires:
    - "09-01: AgentAnimState, STATE_CSS_CLASSES, spriteStates.ts"
    - "@dnd-kit/core + @radix-ui/react-hover-card (installed in Plan 01)"
  provides:
    - "AgentSprite — draggable sprite with CSS animation class and hover card trigger"
    - "AgentHoverCard — 7-field OFFICE-02 data card with formatted elapsed time"
  affects:
    - "Plan 03: OfficePage.tsx imports AgentSprite and wires positions + isDragging prop"
tech_stack:
  added: []
  patterns:
    - "TDD red→green with vi.mock('@dnd-kit/core') to avoid DndContext in every test"
    - "elapsedMs passed as prop to AgentHoverCard — avoids Date.now() flakiness in tests"
    - "Radix HoverCard.Root open={isDragging ? false : undefined} — controlled/uncontrolled toggle"
key_files:
  created:
    - packages/ui/src/components/office/AgentSprite.tsx
    - packages/ui/src/components/office/AgentHoverCard.tsx
    - packages/ui/src/__tests__/AgentSprite.test.tsx
    - packages/ui/src/__tests__/AgentHoverCard.test.tsx
  modified: []
decisions:
  - "AgentHoverCard receives elapsedMs as prop rather than computing from startedAt — prevents Date.now() flakiness in tests and gives OfficePage full control over refresh cadence"
  - "task title uses workspacePath basename — will improve when SessionRecord gains a title field (noted in component comment)"
  - "Repo name and task title share the same basename value — acceptable given SessionRecord lacks a separate repo field"
metrics:
  duration: "1 min"
  completed_date: "2026-04-07"
  tasks_completed: 2
  files_changed: 4
---

# Phase 9 Plan 2: AgentSprite + AgentHoverCard Visual Components Summary

Draggable sprite with CSS animation class (AgentSprite) and 7-field OFFICE-02 hover card (AgentHoverCard), both TDD-driven with 24 new tests green on top of 130 existing tests.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | AgentSprite — draggable sprite with animation class + hover trigger | f8cc093 | Done |
| 2 | AgentHoverCard — OFFICE-02 required fields | 61dc795 | Done |

## What Was Built

### AgentSprite.tsx

- Props: `session: SessionRecord`, `agentState: AgentAnimState`, `position: { x, y }`, `isDragging: boolean`, `onClick: () => void`
- `useDraggable({ id: session.sessionId })` from dnd-kit wires drag handles
- Root div: absolute positioning at `{ left: position.x, top: position.y }`, `data-testid="agent-sprite-{sessionId}"`
- Inner sprite div: `className="agent-sprite " + STATE_CSS_CLASSES[agentState]` (e.g. `sprite-coding`)
- Label span: basename of `session.workspacePath`
- Wraps `HoverCard.Root openDelay={300} closeDelay={100} open={isDragging ? false : undefined}`
- `HoverCard.Trigger asChild` on root div; `HoverCard.Content` contains `<AgentHoverCard session={session} elapsedMs={0} />`

### AgentHoverCard.tsx

Props: `session: SessionRecord`, `lastToolUsed?: string`, `elapsedMs: number`

Seven OFFICE-02 required fields:
1. **Provider badge** — `'Claude'` or `'Codex'`, colored pill (`bg-blue-500` for claude, `bg-green-600` for codex)
2. **Task title** — `workspacePath.split('/').filter(Boolean).pop()` (`data-testid="task-title"`)
3. **Status** — `session.status` (`data-testid="agent-status"`)
4. **Repo name** — same basename as task title (`data-testid="repo-name"`)
5. **Pending approvals** — `session.pendingApprovals` count (`data-testid="pending-approvals"`)
6. **Last tool used** — `lastToolUsed ?? '—'` (`data-testid="last-tool"`)
7. **Elapsed time** — `${Math.floor(ms/60000)}m ${Math.floor((ms%60000)/1000)}s` (`data-testid="elapsed-time"`)

## Test Results

- `AgentSprite.test.tsx`: 9 tests passing
- `AgentHoverCard.test.tsx`: 15 tests passing
- Full suite: 154 tests passing, 0 failures, 0 regressions

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- packages/ui/src/components/office/AgentSprite.tsx: EXISTS
- packages/ui/src/components/office/AgentHoverCard.tsx: EXISTS
- packages/ui/src/__tests__/AgentSprite.test.tsx: EXISTS
- packages/ui/src/__tests__/AgentHoverCard.test.tsx: EXISTS
- Commit f8cc093: EXISTS
- Commit 61dc795: EXISTS
