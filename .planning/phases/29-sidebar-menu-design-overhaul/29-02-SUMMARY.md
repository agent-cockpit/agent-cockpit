---
phase: 29-sidebar-menu-design-overhaul
plan: "02"
subsystem: ui
tags: [design, tailwind, css-tokens, sidebar, typography]
requires:
  - phase: 29-sidebar-menu-design-overhaul
    provides: "29-01-BRIEF.md design guidance and locked Phase 29 values"
  - phase: 16.8-sidebar-design-overhaul
    provides: "MapSidebar interaction and layout contracts that must remain intact"
provides:
  - "Google Fonts loaded for Press Start 2P and IBM Plex Mono at app startup"
  - "Phase 29 sidebar/menu color tokens added to @theme"
  - "MapSidebar copy and approval visuals aligned with Phase 29 UI spec"
affects: [sidebar-ui, menu-ui, character-picker-ui]
tech-stack:
  added: []
  patterns:
    - "Tailwind v4 theme tokens define semantic design values consumed by component classes and inline styles"
key-files:
  created: []
  modified:
    - "packages/ui/index.html"
    - "packages/ui/src/index.css"
    - "packages/ui/src/components/layout/MapSidebar.tsx"
key-decisions:
  - "Loaded Google Fonts via canonical preconnect and stylesheet links in index.html instead of local @font-face declarations."
  - "Split provider colors into semantic background/text token pairs so badges can share the design system cleanly."
  - "Kept every Phase 16.8 MapSidebar structural contract unchanged while updating only copy and visual treatment."
patterns-established:
  - "Provider badge colors now route through semantic tokens instead of hardcoded OKLCH values."
requirements-completed: [game-ui-design]
duration: 20min
completed: 2026-04-14
---

# Phase 29 Plan 02: Fonts, CSS Tokens, and MapSidebar Polish

**Loaded the intended game UI fonts, added the Phase 29 semantic tokens, and polished MapSidebar copy and approval styling without changing selection, sorting, or focus behavior.**

## Accomplishments

- Added Google Fonts preconnect and stylesheet links for `Press Start 2P` and `IBM Plex Mono` in `packages/ui/index.html`.
- Added the new Phase 29 design tokens to the `@theme` block in `packages/ui/src/index.css`.
- Updated provider badge styles to consume the new semantic token pairs instead of duplicating raw color values.
- Adjusted `MapSidebar.tsx` copy to uppercase terminal-style strings for launch CTA, ended/error metadata, and approval pending text.
- Restyled the pending approvals pill to use the new approval token set while preserving the existing row behavior and selected-state chrome.

## Verification

- Confirmed the new font links and semantic tokens exist on disk.
- Confirmed `MapSidebar` still preserves:
  - local `lastEventAt` descending sort
  - click order `selectSession` -> `onFocusSession` -> `setSessionDetailOpen(true)`
  - existing empty state and selected-row corner frame behavior
- `pnpm --filter @cockpit/ui build` passes after resolving unrelated pre-existing TypeScript issues in the UI package.

## Notes

- The plan file listed six new tokens but enumerated eight concrete additions. The implementation follows the concrete token set used by the sidebar/menu designs:
  - `--color-cockpit-blue-claude-bg`
  - `--color-cockpit-blue-claude-text`
  - `--color-cockpit-purple-codex-bg`
  - `--color-cockpit-purple-codex-text`
  - `--color-approval-bg`
  - `--color-approval-border`
  - `--color-approval-text`
  - `--color-menu-overlay`

---
*Phase: 29-sidebar-menu-design-overhaul*
*Completed: 2026-04-14*
