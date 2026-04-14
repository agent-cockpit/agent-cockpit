---
phase: 27-player-character-selection
plan: 02
subsystem: ui
tags: [react, vitest, character-selection, cockpit-ui]
requires:
  - phase: 27-player-character-selection
    provides: "Character face assets and selection flow context from prior plan work"
provides:
  - "Reusable controlled CharacterPicker component with wrap-around navigation"
  - "Component tests covering portrait rendering, boundary wrap-around, and confirm action"
affects: [menu-popup, player-character-selection, session-ui]
tech-stack:
  added: []
  patterns: [controlled-react-component, modulo-wrap-navigation, component-level-vitest]
key-files:
  created:
    - packages/ui/src/components/sessions/CharacterPicker.tsx
    - packages/ui/src/components/sessions/__tests__/CharacterPicker.test.tsx
  modified: []
key-decisions:
  - "Kept CharacterPicker fully controlled so draft selection and confirm semantics remain separate."
  - "Used the shared CHARACTER_TYPES list and characterFaceUrl helper as the only navigation and asset sources."
patterns-established:
  - "Character cycling derives previous and next values from CHARACTER_TYPES with wrap-around modulo logic."
  - "Picker tests assert real boundary characters instead of duplicating index math in the test body."
requirements-completed: [character-selection]
duration: 11min
completed: 2026-04-14
---

# Phase 27 Plan 02: Character Picker Summary

**Controlled character picker UI with shared face portraits, wrap-around navigation, and confirm-only commit semantics**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-14T14:20:20Z
- **Completed:** 2026-04-14T14:31:33Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added isolated component coverage for face rendering, previous and next wrap-around behavior, and confirm callbacks.
- Implemented `CharacterPicker` as a reusable controlled component using shared office character metadata.
- Kept navigation and confirmation separated so the component is ready to be integrated into menu flows later.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add CharacterPicker tests for render, wrap-around, and confirm** - `3f3dc9b` (test)
2. **Task 2: Implement CharacterPicker as a controlled component** - `a8c4908` (feat)

## Files Created/Modified

- `packages/ui/src/components/sessions/__tests__/CharacterPicker.test.tsx` - Component coverage for portrait rendering, boundary wrap-around, and confirm behavior.
- `packages/ui/src/components/sessions/CharacterPicker.tsx` - Reusable controlled picker with previous and next controls, face portrait, label formatting, and confirm button.
- `.planning/phases/27-player-character-selection/deferred-items.md` - Out-of-scope note for unrelated package tests that still fail under the plan's broad verification command.
- `.planning/phases/27-player-character-selection/27-02-SUMMARY.md` - Execution summary for this plan.

## Decisions Made

- Kept the component store-agnostic and controlled through `value`, `onChange`, and `onConfirm` exactly as planned.
- Formatted display names from the shared `CharacterType` slug values so the UI stays aligned with existing asset naming.

## Deviations from Plan

None in product code. The plan's required command `pnpm --filter @cockpit/ui test -- CharacterPicker` still runs unrelated pre-existing failing tests in the package, so verification also used an isolated command for the new spec:

- `pnpm --filter @cockpit/ui exec vitest run src/components/sessions/__tests__/CharacterPicker.test.tsx`

Impact on plan: no scope creep. The component and its direct tests are complete; only unrelated package test failures prevent the broader command from going green.

## Issues Encountered

- JSX treated the bracketed arrow labels as invalid syntax. The component was corrected to render them as string literals and the isolated test suite then passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `CharacterPicker` is ready to be wired into the menu and player-selection flow.
- The package-level test command remains noisy because of unrelated failures already present in the repository; those were documented in `deferred-items.md`.

## Self-Check

PASSED

- Found all expected files for this plan.
- Verified both task commit hashes exist in git history.

---
*Phase: 27-player-character-selection*
*Completed: 2026-04-14*
