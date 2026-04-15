---
phase: 29
name: sidebar-menu-design-overhaul
milestone: v1.1
status: pending
---

# Phase 29: Sidebar & Menu Design Overhaul

**Goal:** The sidebar and top-bar/menu UI are visually inconsistent with the game's space pixel-art aesthetic. Use `/frontend-design:frontend-design` to study game UI design patterns and color tendencies from shipped pixel-art games, then redesign both surfaces with a coherent, polished look that feels native to the game world.

**Depends on:** Phase 28
**Requirements:** game-ui-design
**Design tool:** `/frontend-design:frontend-design` — REQUIRED for all visual decisions. Must be invoked before any code is written.

## Success Criteria

1. A design brief is produced (palette, typography, spacing system, component patterns) informed by reference games and /frontend-design analysis
2. Sidebar is redesigned: consistent colors, readable typography, proper visual hierarchy for face card + status + approvals
3. Top-bar / menu chrome is redesigned to match the sidebar palette and game UI conventions
4. Character picker (Phase 27) inherits the new design system without a separate redesign pass
5. Visual QA checkpoint: designer sign-off that both surfaces look like they belong in the same game

## Codebase Context

- Sidebar: `packages/ui/src/components/layout/MapSidebar.tsx`
- CSS tokens: `packages/ui/src/index.css` — Tailwind v4 semantic tokens defined here (--color-cockpit-*, etc.)
- Current theme: dark space theme with cyan accents, monospaced data readouts
- Character picker will be at `packages/ui/src/components/sessions/CharacterPicker.tsx` (Phase 27)
- Reference: Phase 16.8 sidebar overhaul decisions in STATE.md for constraints that must be preserved
- Game UI references to study: pixel-art RPGs, sci-fi HUDs, space station management games

## Plans

- 29-01-PLAN.md — Design research: /frontend-design study of pixel-art game UI + color palette + component pattern recommendations (game-ui-design)
- 29-02-PLAN.md — Implement new design tokens + redesign MapSidebar with face cards (game-ui-design)
- 29-03-PLAN.md — Redesign top-bar/menu chrome + CharacterPicker styling + visual QA checkpoint (game-ui-design)
