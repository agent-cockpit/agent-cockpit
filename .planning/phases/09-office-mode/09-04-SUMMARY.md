---
phase: 09-office-mode
plan: "04"
subsystem: ui
tags: [react, typescript, office-mode, agent-sprite, hover-card, vitest]

requires:
  - phase: 09-03
    provides: AgentSprite and OfficePage implemented with AgentHoverCard wired up

provides:
  - AgentSprite accepts elapsedMs and lastToolUsed props forwarded to AgentHoverCard
  - OfficePage computes real elapsedMs and lastToolUsed from session data and events store
  - OFFICE-02 fully satisfied: all 7 hover card fields render real data at runtime

affects:
  - office-mode runtime display
  - AgentHoverCard data quality

tech-stack:
  added: []
  patterns:
    - "Radix HoverCard.Content mock pattern: mock entire module so Content always renders in tests"
    - "Discriminated union type narrowing: cast lastEvent.toolName via (lastEvent.toolName as string | undefined) after type==='tool_call' guard"

key-files:
  created: []
  modified:
    - packages/ui/src/components/office/AgentSprite.tsx
    - packages/ui/src/pages/OfficePage.tsx
    - packages/ui/src/__tests__/AgentSprite.test.tsx
    - packages/ui/src/__tests__/OfficePage.test.tsx

key-decisions:
  - "Radix HoverCard.Content must be mocked in tests to render children synchronously — portal-based conditional rendering prevents AgentHoverCard from mounting during initial render"
  - "elapsedMs added to AgentSprite defaultProps in tests (value 0) to satisfy updated TypeScript interface for all existing test cases"

patterns-established:
  - "When mocking Radix UI components in tests, mock the entire module with passthrough fragments so portal content renders immediately"

requirements-completed: [OFFICE-02]

duration: 3min
completed: "2026-04-07"
---

# Phase 09 Plan 04: Gap Closure — elapsedMs and lastToolUsed Forwarding Summary

**elapsedMs computed from session.startedAt and lastToolUsed extracted from tool_call events, both forwarded through AgentSprite to AgentHoverCard — closing the final two OFFICE-02 gaps**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-07T14:21:55Z
- **Completed:** 2026-04-07T14:24:35Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- AgentSprite interface extended with `elapsedMs: number` and `lastToolUsed?: string`, forwarded to AgentHoverCard replacing hardcoded `elapsedMs={0}`
- OfficePage now computes `Date.now() - Date.parse(session.startedAt)` and extracts `lastEvent.toolName` when `lastEvent.type === 'tool_call'` in the sessions.map loop
- 7 new tests added (3 AgentSprite + 4 OfficePage), total suite grows from 161 to 168, all passing with zero TypeScript errors

## Task Commits

1. **Task 1: Add elapsedMs and lastToolUsed props to AgentSprite and forward to AgentHoverCard** - `e1734d7` (feat)
2. **Task 2: Compute elapsedMs and lastToolUsed in OfficePage and pass to AgentSprite** - `f42fd0a` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified

- `packages/ui/src/components/office/AgentSprite.tsx` - Extended props interface, destructure new props, forward to AgentHoverCard
- `packages/ui/src/pages/OfficePage.tsx` - Compute elapsedMs and lastToolUsed in sessions.map, pass to AgentSprite
- `packages/ui/src/__tests__/AgentSprite.test.tsx` - Mock HoverCard for always-rendered content, capture AgentHoverCard props, add elapsedMs to defaultProps, 3 new forwarding tests
- `packages/ui/src/__tests__/OfficePage.test.tsx` - Extend AgentSprite mock to capture elapsedMs/lastToolUsed, 4 new tests covering computation correctness

## Decisions Made

- Radix HoverCard.Content must be mocked in tests — it only mounts children when the hover card is open (portal-based); without mocking, `AgentHoverCard` never renders during `render()` and prop assertions fail
- `elapsedMs: 0` added to `defaultProps` in AgentSprite tests to satisfy the now-required prop in TypeScript without changing test semantics

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added @radix-ui/react-hover-card mock to AgentSprite tests**
- **Found during:** Task 1 (RED phase — tests failing unexpectedly after implementation)
- **Issue:** Plan instructed capturing AgentHoverCard props via Object.assign in mock, but AgentHoverCard is inside HoverCard.Content which only renders when hover card is open. Even after GREEN implementation, props captured as undefined because the component never mounted.
- **Fix:** Added `vi.mock('@radix-ui/react-hover-card', ...)` with passthrough React.Fragment wrappers for Root, Trigger, and Content so Content always renders children synchronously
- **Files modified:** packages/ui/src/__tests__/AgentSprite.test.tsx
- **Verification:** All 12 AgentSprite tests pass including the 3 new prop-forwarding tests
- **Committed in:** e1734d7 (Task 1 commit)

**2. [Rule 1 - Bug] Added elapsedMs: 0 to AgentSprite test defaultProps**
- **Found during:** Task 2 (TypeScript check)
- **Issue:** Existing 9 AgentSprite tests used `defaultProps` which lacked `elapsedMs`, causing 9 TypeScript errors after making the prop required
- **Fix:** Added `elapsedMs: 0` to `defaultProps` constant
- **Files modified:** packages/ui/src/__tests__/AgentSprite.test.tsx
- **Verification:** `tsc --noEmit` produces zero errors
- **Committed in:** f42fd0a (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical test infrastructure, 1 bug in test props)
**Impact on plan:** Both fixes required for correctness. No scope creep.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- OFFICE-02 fully satisfied: all 7 hover card fields now render real data at runtime
- Phase 9 complete — all office mode requirements met
- 168 tests passing, zero TypeScript errors

---
*Phase: 09-office-mode*
*Completed: 2026-04-07*
