---
phase: 27
name: player-character-selection
milestone: v1.1
status: pending
---

# Phase 27: Player Character Selection UI

**Goal:** The user can choose which character they play as. A character picker is accessible from the top-bar or settings menu — styled like a game screen with left/right arrows to cycle through all 10 characters. The selected character is persisted and the player sprite on the map updates immediately.

**Depends on:** Phase 26
**Requirements:** character-selection

## Success Criteria

1. A character picker UI shows the current character's face portrait and name, with left/right arrows to cycle through all 10
2. Pressing the arrows cycles through `CHARACTER_TYPES` with wrap-around (after last, loops to first)
3. Selected character is persisted to `localStorage` and restored on page load
4. The player sprite on the Office map updates to the selected character's sprite sheet immediately on confirm
5. The picker is reachable from the existing top-bar/settings area without breaking current nav

## Codebase Context

- Characters list: `packages/ui/src/components/office/characterMapping.ts` → `CHARACTER_TYPES` array (10 items)
- Player sprite rendering: `packages/ui/src/pages/OfficePage.tsx` — uses `gameState.player` + sprite sheet
- Store: `packages/ui/src/store/index.ts` — add `selectedPlayerCharacter` field + setter
- Face images will be at `public/sprites/faces/{character}-face.png` (created in Phase 26)
- Top-bar component for entry point: look for existing nav/header in OfficePage or layout

## Plans

- 27-01-PLAN.md — Add selectedPlayerCharacter to Zustand store + localStorage persistence, TDD (character-selection)
- 27-02-PLAN.md — CharacterPicker component: face preview, left/right arrows, confirm button (character-selection)
- 27-03-PLAN.md — Wire picker to player sprite in OfficePage.tsx + top-bar entry point, visual QA checkpoint (character-selection)
