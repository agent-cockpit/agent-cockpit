---
phase: 28-walking-sprites-all-characters
plan: "02"
subsystem: assets
tags: [pixellab, sprite, animation, pixel-art]
requires:
  - phase: 16.4-astronaut-walking-sprite-generation
    provides: "ZIP-based PixelLab extraction pattern for walk frames"
provides:
  - "assets/raw/caveman/walk/{direction}/frame-{0..7}.png"
  - "assets/raw/ghost/walk/{direction}/frame-{0..7}.png"
  - "assets/raw/ninja/walk/{direction}/frame-{0..7}.png"
  - "assets/raw/pirate/walk/{direction}/frame-{0..7}.png"
  - "assets/raw/medicine-woman/walk/{direction}/frame-{0..7}.png"
affects: [player-walk-animation, sprite-sheet-generation]
tech-stack:
  added: []
  patterns:
    - "Queued missing walk directions one character at a time through PixelLab MCP"
    - "Waited for package completion, then extracted all 8 directions from ZIP exports"
key-files:
  created:
    - assets/raw/caveman/walk/
    - assets/raw/ghost/walk/
    - assets/raw/ninja/walk/
    - assets/raw/pirate/walk/
    - assets/raw/medicine-woman/walk/
  modified: []
key-decisions:
  - "Used one-character-at-a-time retries to avoid PixelLab slot contention."
  - "Validated each character only after all eight directions appeared in the ZIP export."
patterns-established:
  - "Serial queueing with a fixed wait-and-check cadence is more reliable than bulk REST retries on PixelLab's current service behavior."
requirements-completed: [all-character-walk-sprites]
duration: 1h 40m
completed: 2026-04-14
---

# Phase 28 Plan 02: Generate walk cycles for caveman, ghost, ninja, pirate, medicine-woman

**Generated and validated 320 raw walk frames across the remaining 5 characters, with human visual approval**

## Performance

- **Duration:** ~1h 40m
- **Tasks:** 2
- **Files created:** 320 PNG frames

## Accomplishments

- Generated full walk-cycle raw frames for `caveman`, `ghost`, `ninja`, `pirate`, and `medicine-woman`.
- Saved all outputs under `assets/raw/{character}/walk/{direction}/frame-{0..7}.png`.
- Resolved the slowest characters by queueing them one-by-one and checking completion after fixed waits.

## Template Used

- `caveman` — `walking-8-frames`
- `ghost` — `walking-8-frames`
- `ninja` — `walking-8-frames`
- `pirate` — `walking-8-frames`
- `medicine-woman` — `walking-8-frames`

## Decisions Made

- Switched fully to one-character-at-a-time scheduling for the remaining five characters.
- Kept the extraction-only workflow separate from generation so retries did not overwrite already-good outputs unnecessarily.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PixelLab slot limits and partial-package timing made broad batch generation unreliable**
- **Found during:** Task 1
- **Issue:** Batch retries frequently produced partial direction coverage or `423` package locks.
- **Fix:** Queued missing directions character-by-character through PixelLab MCP, then extracted only after five-minute checks confirmed readiness.
- **Files modified:** Execution-only temp helper under `scripts/tmp/`
- **Verification:** 5 characters × 8 directions × 8 frames present on disk

---

**Total deviations:** 1 auto-fixed

## Human Checkpoint Result

Approved by user on 2026-04-14 after reviewing the raw walk cycles.

## Self-Check

PASSED

- Found all expected raw walk directories for `caveman`, `ghost`, `ninja`, `pirate`, and `medicine-woman`
- Confirmed 64 frames per character
- Human approval recorded

---
*Phase: 28-walking-sprites-all-characters*
*Completed: 2026-04-14*
