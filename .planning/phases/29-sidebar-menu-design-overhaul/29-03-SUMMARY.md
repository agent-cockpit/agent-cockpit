---
phase: 29-sidebar-menu-design-overhaul
plan: "03"
subsystem: ui
tags: [design, dialog, menu, character-picker, visual-qa]
requires:
  - phase: 29-sidebar-menu-design-overhaul
    provides: "29-02 font loading, semantic tokens, and sidebar baseline styling"
provides:
  - "MenuPopup header and audio controls aligned with Phase 29 game UI copy/style"
  - "CharacterPicker preview and confirm affordances aligned with the shared design system"
  - "Build-verified Phase 29 implementation ready for visual sign-off"
affects: [menu-ui, character-picker-ui]
tech-stack:
  added: []
  patterns:
    - "Dialog and picker surfaces reuse the same cockpit frame and panel-surface language as the sidebar"
key-files:
  created: []
  modified:
    - "packages/ui/src/components/office/MenuPopup.tsx"
    - "packages/ui/src/components/sessions/CharacterPicker.tsx"
    - "packages/ui/src/components/office/AgentSprite.tsx"
    - "packages/ui/src/components/office/__tests__/ApprovalInboxPopup.test.tsx"
    - "packages/ui/src/pages/__tests__/OfficePage.test.tsx"
    - "packages/ui/src/setupTests.ts"
key-decisions:
  - "Kept the existing `bg-black/45` overlay because the plan explicitly accepts it as equivalent to the new overlay token."
  - "Resolved UI package build blockers in adjacent files so the required Phase 29 build gate could pass."
  - "Treated visual sign-off as a human checkpoint after code/build completion rather than inventing a synthetic approval."
patterns-established:
  - "Phase UI execution summaries should call out adjacent build fixes when the acceptance gate depends on them."
requirements-completed: [game-ui-design]
duration: 20min
completed: 2026-04-14
---

# Phase 29 Plan 03: MenuPopup and CharacterPicker Polish

**Finished the menu and character picker polish pass, then cleared the unrelated UI package type errors blocking the required build verification.**

## Accomplishments

- Updated `MenuPopup.tsx` to render all four cockpit corner brackets in the header and use uppercase copy for `GAME MENU`, `AUDIO`, `MASTER AUDIO`, `MUSIC`, and `MUTE`/`UNMUTE`.
- Updated `CharacterPicker.tsx` so the portrait uses `imageRendering: 'pixelated'`, the preview card uses `bg-[var(--color-panel-surface)]`, and the confirm action reads `[ CONFIRM ]`.
- Preserved the menu button positioning and the existing dialog/content structure from the plan constraints.
- Fixed four unrelated pre-existing UI package TypeScript issues that prevented `pnpm --filter @cockpit/ui build` from succeeding:
  - missing `beforeEach` import in `ApprovalInboxPopup.test.tsx`
  - missing `walk` frame count in `AgentSprite.tsx`
  - narrow mock image typing in `OfficePage.test.tsx`
  - incompatible canvas stub typing in `setupTests.ts`

## Verification

- `pnpm --filter @cockpit/ui build` exits `0`.
- Confirmed the expected strings and structure exist on disk:
  - `GAME MENU`
  - `MASTER AUDIO`
  - `UNMUTE` / `MUTE`
  - `[ CONFIRM ]`
  - bottom-left and bottom-right cockpit corners in the menu header

## Human Checkpoint

- Visual QA sign-off is still required to satisfy the plan's explicit designer/user checkpoint.
- Code and build work are complete; the remaining step is human confirmation that the sidebar, menu, and picker now feel like a single game UI.

---
*Phase: 29-sidebar-menu-design-overhaul*
*Completed: 2026-04-14*
