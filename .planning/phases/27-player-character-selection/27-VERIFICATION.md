---
phase: 27-player-character-selection
verified: 2026-04-14T14:57:22Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 6/6
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Open the Office view, click the top-right Menu button, and inspect the character picker presentation"
    expected: "The picker reads as a game-style menu panel with portrait, readable name, left/right arrows, confirm button, and intact audio controls"
    why_human: "Visual styling and layout quality cannot be validated programmatically from source and unit tests alone"
  - test: "Choose several characters through the live menu and confirm each one"
    expected: "The on-map player sprite visibly swaps immediately after each confirm without requiring navigation or reload"
    why_human: "The test suite verifies image source changes, but not the live rendered canvas experience"
  - test: "Select a non-default character, reload the browser page, and reopen the Office view"
    expected: "The previously confirmed character remains selected and the same player sprite is active after reload"
    why_human: "Real browser persistence and boot-time restoration need an end-to-end runtime check"
---

# Phase 27: Player Character Selection UI Verification Report

**Phase Goal:** The user can choose which character they play as. A character picker is accessible from the top-bar or settings menu, styled like a game screen with left/right arrows to cycle through all 10 characters. The selected character is persisted and the player sprite on the map updates immediately.
**Verified:** 2026-04-14T14:57:22Z
**Status:** human_needed
**Re-verification:** Yes - verification refreshed after the OfficePage test fetch-stubbing fix

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | A character picker UI shows the current character's face portrait and name, with left/right arrows to cycle through all 10 characters | ✓ VERIFIED | [packages/ui/src/components/sessions/CharacterPicker.tsx](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/components/sessions/CharacterPicker.tsx:20) renders the portrait, formatted label, previous/next buttons, confirm control, and count indicator across `CHARACTER_TYPES`. |
| 2 | Pressing the arrows cycles through `CHARACTER_TYPES` with wrap-around (after last, loops to first) | ✓ VERIFIED | [CharacterPicker.tsx](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/components/sessions/CharacterPicker.tsx:21) computes previous/next with modulo wrap-around, and [CharacterPicker.test.tsx](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/components/sessions/__tests__/CharacterPicker.test.tsx:23) covers both boundaries. |
| 3 | Selected character is persisted to `localStorage` and restored on page load | ✓ VERIFIED | [packages/ui/src/store/index.ts](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/store/index.ts:20) restores validated storage state, [index.ts](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/store/index.ts:127) persists on setter calls, and [uiSlice.test.ts](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/__tests__/uiSlice.test.ts:25) covers default, restore, invalid fallback, and persist flows. |
| 4 | The player sprite on the Office map updates to the selected character's sprite sheet immediately on confirm | ✓ VERIFIED | [packages/ui/src/components/office/MenuPopup.tsx](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/components/office/MenuPopup.tsx:57) confirms through `setSelectedPlayerCharacter(draftCharacter)`, and [packages/ui/src/pages/OfficePage.tsx](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/pages/OfficePage.tsx:243) swaps the player image source to `/sprites/${selectedPlayerCharacter}-sheet.png`. |
| 5 | The picker is reachable from the existing top-bar/settings area without breaking current nav | ✓ VERIFIED | [packages/ui/src/pages/OfficePage.tsx](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/pages/OfficePage.tsx:515) still exposes the top-right `Menu` button and mounts [MenuPopup.tsx](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/components/office/MenuPopup.tsx:13), which retains the audio controls alongside the picker. |
| 6 | Phase requirement IDs declared in PLAN frontmatter are accounted for in `REQUIREMENTS.md` | ✓ VERIFIED | `.planning/REQUIREMENTS.md` defines `character-selection` at [line 34](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/.planning/REQUIREMENTS.md:34) and maps it to `Phase 27` at [line 179](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/.planning/REQUIREMENTS.md:179). |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/ui/src/store/index.ts` | Persisted player character state and setter in app store | ✓ VERIFIED | Exists, is substantive, and `gsd-tools verify artifacts` passed for plan 01. |
| `packages/ui/src/__tests__/uiSlice.test.ts` | Regression coverage for default, restore, fallback, and persistence flows | ✓ VERIFIED | Exists, is substantive, and the focused Vitest suite passes. |
| `packages/ui/src/components/sessions/CharacterPicker.tsx` | Reusable controlled picker component | ✓ VERIFIED | Exists, is substantive, and is wired into `MenuPopup`. |
| `packages/ui/src/components/sessions/__tests__/CharacterPicker.test.tsx` | Wrap-around and confirm tests | ✓ VERIFIED | Exists, is substantive, and passes in the focused Vitest suite. |
| `packages/ui/src/components/office/MenuPopup.tsx` | Character selection entry point inside existing menu | ✓ VERIFIED | Exists, is substantive, and `gsd-tools verify artifacts` passed for plan 03. |
| `packages/ui/src/pages/OfficePage.tsx` | State-driven player sprite loading | ✓ VERIFIED | Exists, is substantive, and reacts to store-selected character changes through an effect. |
| `.planning/REQUIREMENTS.md` | Requirement definition and traceability row for `character-selection` | ✓ VERIFIED | Contains both the requirement definition and the `Phase 27` traceability entry. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `packages/ui/src/store/index.ts` | `window.localStorage` | `PLAYER_CHARACTER_STORAGE_KEY` | ✓ WIRED | [index.ts](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/store/index.ts:26) reads the raw persisted value and [index.ts](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/store/index.ts:127) writes it back under the same key. |
| `packages/ui/src/components/sessions/CharacterPicker.tsx` | `packages/ui/src/components/office/characterMapping.ts` | `CHARACTER_TYPES + characterFaceUrl` | ✓ WIRED | [CharacterPicker.tsx](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/components/sessions/CharacterPicker.tsx:1) imports both shared exports and uses them for wrap-around navigation and portrait sourcing. |
| `packages/ui/src/components/office/MenuPopup.tsx` | `packages/ui/src/store/index.ts` | `setSelectedPlayerCharacter` | ✓ WIRED | [MenuPopup.tsx](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/components/office/MenuPopup.tsx:16) reads current store state, [line 18](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/components/office/MenuPopup.tsx:18) seeds local draft state, and [line 60](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/components/office/MenuPopup.tsx:60) commits on confirm. |
| `packages/ui/src/pages/OfficePage.tsx` | `packages/ui/src/store/index.ts` | `selectedPlayerCharacter selector` | ✓ WIRED | [OfficePage.tsx](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/pages/OfficePage.tsx:220) subscribes to `selectedPlayerCharacter`, and [line 243](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/pages/OfficePage.tsx:243) swaps the sprite sheet whenever it changes. |
| `27-01/02/03-PLAN.md` | `.planning/REQUIREMENTS.md` | `requirements: [character-selection]` | ✓ WIRED | All three plans declare `character-selection`, which is now defined and traced in `.planning/REQUIREMENTS.md`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `packages/ui/src/store/index.ts` | `selectedPlayerCharacter` | `window.localStorage.getItem(PLAYER_CHARACTER_STORAGE_KEY)` validated against `CHARACTER_TYPES` | Yes | ✓ FLOWING |
| `packages/ui/src/components/sessions/CharacterPicker.tsx` | `value` / `safeIndex` | Controlled prop from parent, resolved against shared `CHARACTER_TYPES` | Yes | ✓ FLOWING |
| `packages/ui/src/components/office/MenuPopup.tsx` | `draftCharacter` | Initialized from the persisted store value when the menu opens | Yes | ✓ FLOWING |
| `packages/ui/src/pages/OfficePage.tsx` | `selectedPlayerCharacter` | Zustand selector from `useStore` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Store restore/persist, picker wrap-around, menu confirm wiring, and OfficePage sprite-sheet selection | `pnpm --filter @cockpit/ui exec vitest run src/__tests__/uiSlice.test.ts src/components/sessions/__tests__/CharacterPicker.test.tsx src/components/office/__tests__/MenuPopup.test.tsx src/pages/__tests__/OfficePage.test.tsx` | 4 files passed, 32 tests passed, exit code 0 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `character-selection` | `27-01`, `27-02`, `27-03` | User can open a character picker from the existing menu/settings area, cycle through all available player characters with wrap-around, persist the confirmed choice locally, and see the Office map player sprite update immediately | ✓ SATISFIED | Implemented across [store/index.ts](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/store/index.ts:14), [CharacterPicker.tsx](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/components/sessions/CharacterPicker.tsx:20), [MenuPopup.tsx](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/components/office/MenuPopup.tsx:13), and [OfficePage.tsx](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/pages/OfficePage.tsx:218), with traceability recorded in [.planning/REQUIREMENTS.md](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/.planning/REQUIREMENTS.md:179). |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None | - | No blocking or notable anti-patterns detected in the verified phase files or focused evidence suite | - | The prior OfficePage jsdom fetch-noise note is no longer current because the test now stubs `/maps/maps-manifest.json` explicitly at [packages/ui/src/pages/__tests__/OfficePage.test.tsx](/Users/fabiomissiaggiabrugnara/Projects/Cockpit/agent-cockpit/packages/ui/src/pages/__tests__/OfficePage.test.tsx:89). |

### Human Verification Required

### 1. Picker Visual QA

**Test:** Open Office view, click `Menu`, and inspect the character picker panel.
**Expected:** The picker looks like an in-world game menu with portrait, readable character name, left/right arrows, and confirm button while audio controls remain intact.
**Why human:** Styling quality and visual composition cannot be verified from source and unit tests alone.

### 2. Live Sprite Swap

**Test:** Confirm different characters through the live menu while watching the player on the Office map.
**Expected:** The rendered player sprite changes immediately after each confirm.
**Why human:** Tests prove image-source mutation, not the user-visible canvas presentation.

### 3. Reload Persistence

**Test:** Pick a non-default character, reload the page, and check the Office view again.
**Expected:** The selected character remains active after reload and the corresponding player sprite is still used.
**Why human:** End-to-end browser persistence at actual app boot is a runtime check outside this static verification pass.

---

_Verified: 2026-04-14T14:57:22Z_
_Verifier: Claude (gsd-verifier)_
