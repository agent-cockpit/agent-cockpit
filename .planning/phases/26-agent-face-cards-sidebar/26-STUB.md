---
phase: 26
name: agent-face-cards-sidebar
milestone: v1.1
status: pending
---

# Phase 26: Agent Face Cards in Sidebar

**Goal:** Each session row in the sidebar shows the agent's character face portrait — a small avatar image pulled from `assets/raw/{character}/face/` — giving the user an instant visual identity for every running agent at a glance.

**Depends on:** Phase 25
**Requirements:** sidebar-face-card

## Success Criteria

1. Face images for all 10 characters are published to `public/sprites/faces/{character}-face.png` via a build/copy step
2. `MapSidebar.tsx` resolves the character for each session using `sessionToCharacter()` and renders the correct face image
3. Face image renders as a fixed-size (32×32 px) rounded avatar at the left edge of each session row
4. If an image fails to load, a graceful fallback (character initial or generic icon) is shown — no broken-image box
5. Existing sidebar layout (status dot, project name, provider badge, approvals pill) is preserved and not broken

## Codebase Context

- Face PNGs already exist: `assets/raw/{character}/face/` — one PNG per character, all 10 present
- Character resolution: `packages/ui/src/components/office/characterMapping.ts` → `sessionToCharacter(sessionId)`
- Target component: `packages/ui/src/components/layout/MapSidebar.tsx`
- Characters: astronaut, robot, alien, hologram, monkey, caveman, ghost, ninja, pirate, medicine-woman

## Plans

- 26-01-PLAN.md — Copy/export face PNGs to public/sprites/faces/, add characterFaceUrl() helper, TDD (sidebar-face-card)
- 26-02-PLAN.md — Render face avatar in MapSidebar.tsx with fallback, visual QA checkpoint (sidebar-face-card)
