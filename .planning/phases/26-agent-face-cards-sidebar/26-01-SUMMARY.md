---
phase: 26-agent-face-cards-sidebar
plan: "01"
subsystem: ui
tags: [character, faces, sprites, sharp, asset-pipeline]

# Dependency graph
requires: []
provides:
  - characterFaceUrl() helper exported from characterMapping.ts
  - 10 face PNGs at packages/ui/public/sprites/faces/{character}-face.png (64x64)
  - scripts/copy-faces.ts asset pipeline script
affects: [26-02, sidebar-face-card]

# Tech tracking
tech-stack:
  added: []
  patterns: [characterFaceUrl maps CharacterType to /sprites/faces/{character}-face.png]

key-files:
  created:
    - scripts/copy-faces.ts
    - packages/ui/src/components/office/__tests__/characterMapping.test.ts
    - packages/ui/public/sprites/faces/ (10 PNGs)
  modified:
    - packages/ui/src/components/office/characterMapping.ts
    - package.json

key-decisions:
  - "copy-faces.ts run from packages/ui directory (not root) so pnpm can resolve sharp from packages/ui devDependencies"
  - "npm script uses 'cd packages/ui && pnpm exec tsx ../../scripts/copy-faces.ts' to ensure correct resolution context"

patterns-established:
  - "characterFaceUrl pattern: /sprites/faces/{character}-face.png mirrors existing /sprites/{character}-sheet.png"

requirements-completed:
  - sidebar-face-card

# Metrics
duration: 5min
completed: 2026-04-14
---

# Phase 26 Plan 01: Agent Face Cards Sidebar — Asset Pipeline Summary

**characterFaceUrl() helper added to characterMapping.ts plus 10 face PNGs copied and resized to 64x64 at /sprites/faces/ via sharp-powered build script**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-14T13:39:30Z
- **Completed:** 2026-04-14T13:44:00Z
- **Tasks:** 2
- **Files modified:** 5 (+ 10 PNG assets)

## Accomplishments
- `characterFaceUrl(character)` exported from `characterMapping.ts`, returns `/sprites/faces/{character}-face.png` for all 10 CHARACTER_TYPES
- 32 tests pass covering all character types (URL format validation + exact match)
- `scripts/copy-faces.ts` reads raw face PNGs from `assets/raw/{character}/face/`, resizes to 64x64 cover crop, and writes to `packages/ui/public/sprites/faces/`
- `copy-faces` npm script added to root `package.json`

## Task Commits

1. **Task 1 RED: failing tests for characterFaceUrl** - `ff11b7b` (test)
2. **Task 1 GREEN: characterFaceUrl() implementation** - `519284c` (feat)
3. **Task 2: copy-faces script + 10 face PNGs** - `cf12b7b` (feat)

## Files Created/Modified
- `packages/ui/src/components/office/__tests__/characterMapping.test.ts` - 22 tests for characterFaceUrl (all 10 types, format validation)
- `packages/ui/src/components/office/characterMapping.ts` - Added characterFaceUrl() export (4 lines)
- `scripts/copy-faces.ts` - Asset pipeline: reads raw PNGs, sharp-resize to 64x64, writes to public/sprites/faces/
- `packages/ui/public/sprites/faces/` - 10 face PNGs: astronaut, robot, alien, hologram, monkey, caveman, ghost, ninja, pirate, medicine-woman
- `package.json` - Added copy-faces npm script

## Decisions Made
- `copy-faces.ts` must be invoked via `cd packages/ui && pnpm exec tsx ...` because `sharp` lives in `packages/ui` devDependencies, not in the root workspace. Running from root caused `MODULE_NOT_FOUND` for sharp.
- npm script wraps the cd so callers can just run `pnpm copy-faces` from root.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Script must run from packages/ui to resolve sharp**
- **Found during:** Task 2 (running copy-faces.ts)
- **Issue:** Running `pnpm exec tsx scripts/copy-faces.ts` from root failed with `Cannot find module 'sharp'` because sharp is only in `packages/ui` devDependencies
- **Fix:** Updated npm script in package.json to `cd packages/ui && pnpm exec tsx ../../scripts/copy-faces.ts`
- **Files modified:** package.json
- **Verification:** Script ran successfully, all 10 PNGs confirmed at destination
- **Committed in:** cf12b7b (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required to make the npm script work. No scope creep.

## Issues Encountered
- `npx tsx` failed because root package.json has no `tsx` script entry (expected, as tsx is a devDep not a script). Fixed by using `pnpm exec tsx`.

## Next Phase Readiness
- Plan 02 can import `characterFaceUrl` from characterMapping.ts and use `/sprites/faces/{character}-face.png` URLs directly
- All 10 face PNGs are available and browser-accessible at the canonical URL pattern
- No blockers for sidebar avatar rendering

---
*Phase: 26-agent-face-cards-sidebar*
*Completed: 2026-04-14*
