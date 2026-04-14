---
phase: 28
name: walking-sprites-all-characters
milestone: v1.1
status: pending
---

# Phase 28: Walking Sprites for All Characters

**Goal:** Currently only the astronaut has a proper 8-direction walk cycle. Generate walking sprite sheets for the remaining 9 characters (robot, alien, hologram, monkey, caveman, ghost, ninja, pirate, medicine-woman) using the PixelLab `animate_character` API, matching the astronaut's format (8 frames × 4 cardinal directions, 64px).

**Depends on:** Phase 27
**Requirements:** all-character-walk-sprites

## Success Criteria

1. All 9 non-astronaut characters have walk-cycle rows appended to their sprite sheets in `public/sprites/{character}-sheet.png`
2. Each walk cycle matches the astronaut format: 8 frames per direction, 4 cardinal directions, 64px tile size
3. `build-spritesheet.ts` is extended to handle all 10 characters with the same pipeline
4. `spriteStates.ts` / `characterMapping.ts` require no per-character special-cases — all use the same `STATE_ROW_OFFSET.walk` constant
5. A visual QA checkpoint confirms each character walks smoothly in-game without frame glitches

## Codebase Context

- Astronaut walk generation reference: `.planning/phases/16.4-astronaut-walking-sprite-generation/` — used PixelLab `animate_character` with `walking-8-frames` template
- Build pipeline: `scripts/build-spritesheet.ts` (check exact path)
- Sprite state constants: `packages/ui/src/components/office/spriteStates.ts` → `STATE_ROW_OFFSET.walk = 32`
- Walk frame count: `WALK_FRAME_COUNT = 8` (already set)
- PixelLab API docs: `https://api.pixellab.ai/mcp/docs` — RGBA bytes, decode via sharp.raw()
- Existing character sheets: `public/sprites/{character}-sheet.png` — each has idle/state rows 0–31; walk rows appended at row 32+

## Plans

- 28-01-PLAN.md — Generate walk cycles for robot, alien, hologram, monkey (PixelLab batch + visual QA) (all-character-walk-sprites)
- 28-02-PLAN.md — Generate walk cycles for caveman, ghost, ninja, pirate, medicine-woman (PixelLab batch + visual QA) (all-character-walk-sprites)
- 28-03-PLAN.md — Rebuild all 10 sprite sheets via build-spritesheet.ts, verify walk rows, in-game QA checkpoint (all-character-walk-sprites)
