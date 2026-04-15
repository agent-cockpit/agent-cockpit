---
phase: 28-walking-sprites-all-characters
plan: "01"
subsystem: assets
tags: [pixellab, sprite, animation, pixel-art]
requires:
  - phase: 16.4-astronaut-walking-sprite-generation
    provides: "ZIP-based PixelLab extraction pattern for walk frames"
provides:
  - "assets/raw/robot/walk/{direction}/frame-{0..7}.png"
  - "assets/raw/alien/walk/{direction}/frame-{0..7}.png"
  - "assets/raw/hologram/walk/{direction}/frame-{0..7}.png"
  - "assets/raw/monkey/walk/{direction}/frame-{0..7}.png"
affects: [player-walk-animation, sprite-sheet-generation]
tech-stack:
  added: []
  patterns:
    - "Queued PixelLab walking-8-frames per character, then extracted completed walk frames from character ZIP exports"
    - "Validated 8 frames across 8 directions before proceeding to sheet rebuild"
key-files:
  created:
    - assets/raw/robot/walk/
    - assets/raw/alien/walk/
    - assets/raw/hologram/walk/
    - assets/raw/monkey/walk/
  modified: []
key-decisions:
  - "Used the existing walking-8-frames template for all four characters."
  - "Switched from background-job frame decoding to ZIP extraction because PixelLab's REST response shape became inconsistent mid-run."
patterns-established:
  - "Character ZIP export is the reliable source of truth when animate_character returns unstable job groupings."
requirements-completed: [all-character-walk-sprites]
duration: 1h 10m
completed: 2026-04-14
---

# Phase 28 Plan 01: Generate walk cycles for robot, alien, hologram, monkey

**Generated and validated 256 raw walk frames across 4 characters, with human visual approval**

## Performance

- **Duration:** ~1h 10m
- **Tasks:** 2
- **Files created:** 256 PNG frames

## Accomplishments

- Generated proper walk cycles for `robot`, `alien`, `hologram`, and `monkey`.
- Saved 8 directions × 8 frames per character under `assets/raw/{character}/walk/`.
- Confirmed all four characters passed the human visual review gate before Wave 2.

## Template Used

- `robot` — `walking-8-frames`
- `alien` — `walking-8-frames`
- `hologram` — `walking-8-frames`
- `monkey` — `walking-8-frames`

## Decisions Made

- Kept the template fixed at `walking-8-frames` once PixelLab confirmed it for each character.
- Treated the downloadable ZIP package as authoritative because direct background-job responses were incomplete or unstable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PixelLab job responses no longer matched the Phase 16.4 assumption**
- **Found during:** Task 1
- **Issue:** `animate-character` returned inconsistent partial job sets instead of a stable 8-job one-direction-per-job layout.
- **Fix:** Downloaded the character ZIP after generation and extracted the walk frames from `metadata.json` + `animations/*`.
- **Files modified:** Execution-only temp helper under `scripts/tmp/`
- **Verification:** 4 characters × 8 directions × 8 frames present on disk

---

**Total deviations:** 1 auto-fixed

## Human Checkpoint Result

Approved by user on 2026-04-14 after reviewing the raw walk cycles.

## Self-Check

PASSED

- Found all expected raw walk directories for `robot`, `alien`, `hologram`, and `monkey`
- Confirmed 64 frames per character
- Human approval recorded

---
*Phase: 28-walking-sprites-all-characters*
*Completed: 2026-04-14*
