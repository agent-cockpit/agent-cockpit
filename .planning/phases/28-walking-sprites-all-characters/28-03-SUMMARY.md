---
phase: 28-walking-sprites-all-characters
plan: "03"
subsystem: ui
tags: [spritesheet, assets, office-mode, pixel-art]
requires:
  - phase: 28-walking-sprites-all-characters
    provides: "Complete raw walk-frame sets for all 9 non-astronaut characters"
provides:
  - "packages/ui/public/sprites/{character}-sheet.png at 576x2560"
  - "packages/ui/public/sprites/{character}-manifest.json with states.walk = 8"
affects: [player-walk-animation, office-mode]
tech-stack:
  added: []
  patterns:
    - "Ran build-spritesheet.ts from packages/ui so sharp resolves from the package that owns the dependency"
    - "Verified manifest shape and sprite dimensions after rebuilding each sheet"
key-files:
  created:
    - .planning/phases/28-walking-sprites-all-characters/28-03-SUMMARY.md
  modified:
    - packages/ui/public/sprites/robot-sheet.png
    - packages/ui/public/sprites/robot-manifest.json
    - packages/ui/public/sprites/alien-sheet.png
    - packages/ui/public/sprites/alien-manifest.json
    - packages/ui/public/sprites/hologram-sheet.png
    - packages/ui/public/sprites/hologram-manifest.json
    - packages/ui/public/sprites/monkey-sheet.png
    - packages/ui/public/sprites/monkey-manifest.json
    - packages/ui/public/sprites/caveman-sheet.png
    - packages/ui/public/sprites/caveman-manifest.json
    - packages/ui/public/sprites/ghost-sheet.png
    - packages/ui/public/sprites/ghost-manifest.json
    - packages/ui/public/sprites/ninja-sheet.png
    - packages/ui/public/sprites/ninja-manifest.json
    - packages/ui/public/sprites/pirate-sheet.png
    - packages/ui/public/sprites/pirate-manifest.json
    - packages/ui/public/sprites/medicine-woman-sheet.png
    - packages/ui/public/sprites/medicine-woman-manifest.json
key-decisions:
  - "Kept build-spritesheet.ts unchanged and invoked it from packages/ui instead of patching module resolution."
  - "Left astronaut assets untouched; Phase 16.4 already produced the correct 40-row sheet."
patterns-established:
  - "Shared asset-build scripts can be run from the owning workspace when dependencies are hoisted differently than the repo root."
requirements-completed: [all-character-walk-sprites]
duration: 10m
completed: 2026-04-14
---

# Phase 28 Plan 03: Rebuild all 9 non-astronaut sprite sheets

**Rebuilt the 9 non-astronaut sprite sheets and verified the final in-game checkpoint**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2
- **Files modified:** 18 asset files

## Accomplishments

- Rebuilt all 9 non-astronaut sheets to `576×2560`.
- Verified every manifest now reports `walk: 8`, `frameSize: 64`, and `directions: 8`.
- Confirmed via human in-game checkpoint that all 10 playable characters walk correctly and return to idle cleanly.

## Decisions Made

- Used `pnpm --dir packages/ui exec tsx ../../scripts/build-spritesheet.ts <character>` so `sharp` resolves from the UI package.
- Preserved all runtime code and astronaut assets exactly as they were.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Root-level build invocation could not resolve sharp**
- **Found during:** Task 1
- **Issue:** `npx tsx scripts/build-spritesheet.ts` from the repo root failed because `sharp` is installed under `packages/ui`.
- **Fix:** Ran the existing script from the UI package context instead of editing the build script.
- **Files modified:** None
- **Verification:** All 9 sheets rebuilt successfully and passed dimension checks

---

**Total deviations:** 1 auto-fixed

## Human Checkpoint Result

Approved by user on 2026-04-14 after confirming:

- all 10 characters walk with the correct animation
- no regressions to idle transition
- no visible sprite corruption
- NPC state animations still render normally

## Self-Check

PASSED

- All 9 rebuilt sheets are `576x2560`
- All 9 manifests report `walk = 8`
- No source-code files changed
- Astronaut sprite assets unchanged

---
*Phase: 28-walking-sprites-all-characters*
*Completed: 2026-04-14*
