---
phase: 27-player-character-selection
plan: 03
subsystem: ui
tags: [react, zustand, vitest, office-mode, character-selection]
requires:
  - phase: 27-player-character-selection
    provides: "Persisted selectedPlayerCharacter state in the UI store"
  - phase: 27-player-character-selection
    provides: "Controlled CharacterPicker component with confirm-only commit semantics"
provides:
  - "MenuPopup-integrated character selection flow that commits through the shared store"
  - "OfficePage player sprite loading from the committed selected character"
  - "Regression coverage for menu confirmation and sprite-sheet source updates"
affects: [office-mode, menu-popup, player-rendering, audio-controls]
tech-stack:
  added: []
  patterns:
    - Store-backed draft state initialized on menu open before confirm commits
    - React effect-driven sprite image replacement keyed by selectedPlayerCharacter
key-files:
  created:
    - .planning/phases/27-player-character-selection/27-03-SUMMARY.md
  modified:
    - packages/ui/src/components/office/MenuPopup.tsx
    - packages/ui/src/components/office/__tests__/MenuPopup.test.tsx
    - packages/ui/src/pages/OfficePage.tsx
    - packages/ui/src/pages/__tests__/OfficePage.test.tsx
key-decisions:
  - "Kept CharacterPicker embedded directly in MenuPopup so character selection remains additive to the existing menu instead of creating a separate settings flow."
  - "Replaced only the player image source setup in OfficePage; the existing canvas render loop and draw path stay unchanged."
patterns-established:
  - "Office-mode UI can derive a local draft from persisted Zustand state and commit only on explicit confirmation."
  - "Player sprite asset swaps happen through a dedicated Image effect keyed by store selection rather than through render-loop branching."
requirements-completed: [character-selection]
duration: 8min
completed: 2026-04-14
---

# Phase 27 Plan 03: Menu-integrated character selection with immediate sprite-sheet swap

**Office menu now exposes character selection, confirms through the persisted UI store, and reloads the office player sprite sheet from the committed character choice**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-14T14:36:00Z
- **Completed:** 2026-04-14T14:43:54Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added RED integration coverage for reaching the picker from `MenuPopup`, confirming a draft character, and observing `OfficePage` choose the expected sprite sheet.
- Integrated `CharacterPicker` into the existing game menu without removing or reshaping the audio controls.
- Made `OfficePage` replace the hardcoded astronaut sheet with `/sprites/${selectedPlayerCharacter}-sheet.png`, so confirmed choices apply immediately.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend MenuPopup and OfficePage tests for integrated character flow** - `6bb3d56` (test)
2. **Task 2: Integrate CharacterPicker into MenuPopup** - `82ba449` (feat)
3. **Task 3: Make OfficePage load the committed player sprite selection** - `ebf0da0` (feat)

## Files Created/Modified

- `packages/ui/src/components/office/__tests__/MenuPopup.test.tsx` - Adds menu-level coverage for picker reachability and confirm-to-store behavior.
- `packages/ui/src/components/office/MenuPopup.tsx` - Embeds `CharacterPicker`, keeps a draft selection, and commits through `setSelectedPlayerCharacter`.
- `packages/ui/src/pages/__tests__/OfficePage.test.tsx` - Verifies selected-character sprite sheet sourcing through a mocked `Image` constructor.
- `packages/ui/src/pages/OfficePage.tsx` - Reads `selectedPlayerCharacter` from the store and refreshes the player sprite image when it changes.
- `.planning/phases/27-player-character-selection/27-03-SUMMARY.md` - Records execution, verification, and out-of-scope test failures for this plan.

## Decisions Made

- Embedded character selection directly into `MenuPopup` so the existing top-right menu remains the single settings surface.
- Kept confirmation semantics store-driven: `MenuPopup` owns only the draft, while the store remains the committed source of truth that `OfficePage` reacts to.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected the new picker test to use a real character fixture**
- **Found during:** Task 2 (Integrate CharacterPicker into MenuPopup)
- **Issue:** The added RED test expected `female`, which is not in the shared `CHARACTER_TYPES` list.
- **Fix:** Updated the test to assert the next valid character from `astronaut`, which is `robot`.
- **Files modified:** `packages/ui/src/components/office/__tests__/MenuPopup.test.tsx`
- **Verification:** `pnpm --filter @cockpit/ui exec vitest run src/components/office/__tests__/MenuPopup.test.tsx`
- **Committed in:** `82ba449` (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The fix kept the test aligned with the existing asset contract. No product scope change.

## Issues Encountered

- The plan's broad verification command, `pnpm --filter @cockpit/ui test -- MenuPopup OfficePage`, still fails because Vitest runs unrelated pre-existing suites in the UI package. Observed out-of-scope failures include `approvalsSlice`, `eventsSlice`, `AgentHoverCard`, `DiffPanel`, `HistoryPage`, and `OpsLayout`.
- The changed surface was verified directly with `pnpm --filter @cockpit/ui exec vitest run src/components/office/__tests__/MenuPopup.test.tsx src/pages/__tests__/OfficePage.test.tsx`, which passes all 19 relevant tests.
- `OfficePage` tests still log expected fetch URL parse errors from jsdom when the map-loading effects run without a mocked browser URL context. Those logs do not fail the focused suite and are pre-existing test-environment noise for this page.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The office menu now provides a complete picker-to-store confirmation path on top of the persisted character state from 27-01 and the controlled picker from 27-02.
- Office-mode rendering now honors restored persisted character choice on load because the sprite image source follows `selectedPlayerCharacter`.

## Self-Check

PASSED

- Found summary file: `.planning/phases/27-player-character-selection/27-03-SUMMARY.md`
- Found commit: `6bb3d56`
- Found commit: `82ba449`
- Found commit: `ebf0da0`
- No blocking stubs introduced by this plan.

---
*Phase: 27-player-character-selection*
*Completed: 2026-04-14*
