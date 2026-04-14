---
phase: 29-sidebar-menu-design-overhaul
plan: 01
subsystem: ui
tags: [design, pixel-art, tailwind, css-tokens, game-ui, color-validation]

# Dependency graph
requires:
  - phase: 29-sidebar-menu-design-overhaul
    provides: "29-UI-SPEC.md with locked color values and component patterns"
  - phase: 16.8-sidebar-design-overhaul
    provides: "locked session row click contract, sort order, resize handle constraints"
provides:
  - "29-01-BRIEF.md — design research artifact validating all locked color decisions from 29-UI-SPEC.md"
  - "Reference game analysis: FTL, Dead Cells, Stardew Valley, Into the Breach pixel-art UI patterns"
  - "Color validation verdicts: cyan VALIDATED, provider badge hues VALIDATED, amber pill VALIDATED"
  - "5 component pattern descriptions ready for Plan 02/03 implementation"
affects:
  - "29-02 (token implementation)"
  - "29-03 (component polish pass)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Design BRIEF as pre-implementation validation artifact — validates color tokens against reference games before writing code"

key-files:
  created:
    - ".planning/phases/29-sidebar-menu-design-overhaul/29-01-BRIEF.md"
  modified: []

key-decisions:
  - "cyan oklch(0.75 0.18 195) validated as correct phosphor hue — matches Into the Breach cyan and FTL UI chrome convention; distinct from --color-cockpit-green (hue 155, 40° apart)"
  - "provider badge hue 255 (Claude) vs hue 295 (Codex): 40° hue separation on panel-surface confirmed distinguishable; badge border adds third distinguishing layer"
  - "amber approval pill oklch(0.75 0.16 75 / 0.2) readable against both selected (cyan-tinted) and unselected (dark) row backgrounds; amber glow text-shadow increases apparent contrast"
  - "no blocking deviations from 29-UI-SPEC.md — Plan 02 proceeds with all locked values unchanged"
  - "frontend-design skill not available — BRIEF written manually per plan fallback instructions"

patterns-established:
  - "Design BRIEF pattern: reference game study + color validation + component patterns = pre-implementation research artifact"

requirements-completed: [game-ui-design]

# Metrics
duration: 3min
completed: 2026-04-14
---

# Phase 29 Plan 01: Sidebar Menu Design — Reference Game Analysis and Color Validation BRIEF

**Design BRIEF produced validating all 29-UI-SPEC.md locked colors against FTL, Dead Cells, Stardew Valley, and Into the Breach pixel-art UI palettes — all three color decisions confirmed, no blocking deviations.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-14T13:31:50Z
- **Completed:** 2026-04-14T13:35:08Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Produced `.planning/phases/29-sidebar-menu-design-overhaul/29-01-BRIEF.md` with complete reference game analysis
- Validated all three locked color decisions from 29-UI-SPEC.md (cyan, provider badge hues, amber approval pill)
- Documented 5 required component patterns: session row (3 states), sidebar header, menu button, MenuPopup dialog, CharacterPicker
- Identified calibration notes for Plan 02/03 (amber pill opacity may need `/0.25` tuning, cyan 10% budget enforcement)
- Confirmed all Phase 16.8 constraints are correctly documented and must be preserved

## Task Commits

1. **Task 1: Produce BRIEF.md with reference game analysis and color validation** - `5791b9d` (feat)

## Files Created/Modified

- `.planning/phases/29-sidebar-menu-design-overhaul/29-01-BRIEF.md` — Full design research brief: 4 reference game sections, 3 color validation verdicts, 5 ASCII-art component patterns, calibration notes, Plan 02/03 implementation guidance

## Decisions Made

- `/frontend-design` skill not available — wrote BRIEF manually per plan fallback instructions; all required content produced per spec
- Cyan validated against Into the Breach (hue ~190-195, nearly identical) and FTL (cyan as UI chrome, not data color)
- Provider badge hue 255 vs 295 separation confirmed distinguishable at 40° delta; borders add third distinguishing layer
- Amber pill validated readable on both backgrounds; `/0.2` opacity is intentionally subtle with glow compensation

## Deviations from Plan

None - plan executed exactly as written. The `/frontend-design` skill fallback path was explicitly specified in the plan and followed precisely.

## Issues Encountered

- Worktree `.planning` directory lacked the `29-sidebar-menu-design-overhaul` subdirectory — created it and placed BRIEF.md in the correct location
- Worktree base was not on commit `fa71d88` — applied `git reset --soft fa71d88` to align, then committed only the new BRIEF.md file

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 (token implementation) has a complete BRIEF to reference before writing any CSS
- All color decisions confirmed — no OKLCH value changes needed before implementation
- Key pre-conditions for Plan 02: add Google Fonts `<link>` tags to `index.html` first, then add 6 new `@theme` tokens
- Calibration note for Plan 02: enforce the cyan 10% usage budget strictly; do not add new cyan surfaces without displacing existing ones

---
*Phase: 29-sidebar-menu-design-overhaul*
*Completed: 2026-04-14*
