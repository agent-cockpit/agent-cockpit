---
phase: 09-office-mode
plan: "01"
subsystem: ui
tags: [tdd, sprite-states, local-storage, dnd-kit, office-mode]
dependency_graph:
  requires: []
  provides:
    - AgentAnimState type + deriveAgentState function (spriteStates.ts)
    - useLocalStorage hook (hooks/useLocalStorage.ts)
    - placeholder sprite sheet (sprites/agent-sheet.png)
    - @dnd-kit/core and @dnd-kit/utilities installed
  affects:
    - Plan 02: AgentSprite.tsx imports AgentAnimState + STATE_CSS_CLASSES
    - Plan 03: OfficePage.tsx uses useLocalStorage for position persistence
tech_stack:
  added:
    - "@dnd-kit/core ^6.3.1"
    - "@dnd-kit/utilities ^3.2.2"
    - "@radix-ui/react-hover-card (installed for Plan 02)"
  patterns:
    - TDD red→green cycle for pure logic modules
    - useState lazy initializer for SSR-safe localStorage reads
    - useCallback([key]) for stable setter reference
key_files:
  created:
    - packages/ui/src/components/office/spriteStates.ts
    - packages/ui/src/hooks/useLocalStorage.ts
    - packages/ui/src/sprites/agent-sheet.png
    - packages/ui/src/__tests__/spriteStates.test.ts
    - packages/ui/src/__tests__/useLocalStorage.test.ts
  modified:
    - packages/ui/package.json (added @dnd-kit/core, @dnd-kit/utilities, @radix-ui/react-hover-card)
    - pnpm-lock.yaml
decisions:
  - "@radix-ui/react-hover-card installed in Plan 01 alongside dnd-kit to front-load all Office Mode dependencies"
  - "tool_call subcases use regex test on lowercased toolName (read|view|grep|search → reading, write|edit|create|apply → coding, test|run|exec|bash → testing)"
  - "useLocalStorage lazy initializer wraps localStorage.getItem in try/catch to handle both SSR and QuotaExceededError"
metrics:
  duration: "2 min"
  completed_date: "2026-04-07"
  tasks_completed: 3
  files_changed: 7
---

# Phase 9 Plan 1: Office Mode Foundations (spriteStates + useLocalStorage) Summary

Pure-logic contracts for Office Mode: event-to-animation-state mapping via `deriveAgentState` and generic localStorage persistence via `useLocalStorage`, both driven by TDD with 24 passing tests.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Install dnd-kit + create placeholder sprite sheet | 46bc39a | Done |
| 2 | TDD spriteStates.ts — AgentAnimState + deriveAgentState | 9c0492d | Done |
| 3 | TDD useLocalStorage — generic localStorage hook | a713941 | Done |

## What Was Built

### spriteStates.ts

- `AgentAnimState` union type: `'planning' | 'coding' | 'reading' | 'testing' | 'waiting' | 'blocked' | 'completed' | 'failed'`
- `deriveAgentState(session, lastEvent)` with priority chain:
  1. `session.status === 'ended'` → `'completed'`
  2. `session.pendingApprovals > 0` → `'blocked'`
  3. `!lastEvent` → `'waiting'`
  4. Switch on `lastEvent.type` with tool_call subcases matching toolName via regex
- `STATE_CSS_CLASSES` mapping each state to `'sprite-{state}'`

### useLocalStorage.ts

- Generic `useLocalStorage<T>(key, defaultValue): [T, setter]` hook
- Lazy initializer reads from localStorage on mount, falls back to defaultValue on error or missing key
- Setter supports both direct value and functional updater `(prev => next)` pattern
- Both read and write wrapped in try/catch (SSR-safe + quota-exceeded-safe)
- `useCallback([key])` ensures stable setter identity

### Dependencies

- `@dnd-kit/core ^6.3.1` + `@dnd-kit/utilities ^3.2.2` (drag-and-drop for Plan 02/03)
- `@radix-ui/react-hover-card` (tooltip on hover for AgentSprite in Plan 02)
- `packages/ui/src/sprites/agent-sheet.png` — 1×1 transparent PNG placeholder (avoids 404 in jsdom tests)

## Test Results

- `spriteStates.test.ts`: 17 tests passing
- `useLocalStorage.test.ts`: 7 tests passing
- Full suite: 130 tests passing, 0 failures, 0 regressions

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- packages/ui/src/components/office/spriteStates.ts: EXISTS
- packages/ui/src/hooks/useLocalStorage.ts: EXISTS
- packages/ui/src/sprites/agent-sheet.png: EXISTS (70 bytes, valid PNG magic byte 0x89)
- Commit 46bc39a: EXISTS
- Commit 9c0492d: EXISTS
- Commit a713941: EXISTS
