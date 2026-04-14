# Phase 27: Player Character Selection UI - Research

**Researched:** 2026-04-14
**Domain:** Zustand UI state, localStorage persistence, menu-based React UI composition, OfficePage sprite loading
**Confidence:** HIGH

## Summary

This phase is a focused frontend feature. The cleanest implementation path is:

1. Add a dedicated `selectedPlayerCharacter` field to the Zustand app store, defaulting to `'astronaut'`, with a small localStorage read/write helper colocated in `packages/ui/src/store/index.ts`.
2. Build a reusable `CharacterPicker` component that accepts `value`, `pendingValue`, or a simple controlled `character` plus `onChange` / `onConfirm` callbacks and derives wrap-around navigation from `CHARACTER_TYPES`.
3. Wire that picker into the existing `MenuPopup` rather than creating a second top-bar surface. The current Office view already exposes a `Menu` button in the top-right, and `MenuPopup` is the project’s current settings surface, so it satisfies the phase goal with minimal UI churn.
4. Change `OfficePage.tsx` so the player sprite image is derived from store state rather than a hardcoded `/sprites/astronaut-sheet.png`. That guarantees immediate visual update after confirm and clean restoration on page reload.

The repo already contains the important primitives:

- `CHARACTER_TYPES`, `CharacterType`, and `characterFaceUrl()` in `packages/ui/src/components/office/characterMapping.ts`
- face images at `/sprites/faces/{character}-face.png` from Phase 26
- a menu/settings surface in `packages/ui/src/components/office/MenuPopup.tsx`
- a canvas-driven player render path in `packages/ui/src/pages/OfficePage.tsx`

No new libraries are needed. The implementation should stay within React, Zustand, and existing testing patterns.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| character-selection | User can pick their player character, persist the choice, and see the map sprite update immediately | Store-level persisted selection, controlled picker UI, and state-driven sprite source satisfy the full requirement |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 18 | 18.3.x | Controlled picker UI + menu composition | Existing UI stack |
| Zustand | current repo version | Global selected player character state | Existing app store |
| Vitest + Testing Library | 3.x | Store/UI regression coverage | Existing test stack |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Radix Dialog | current | Existing menu popup shell | Reuse `MenuPopup`; no new modal system |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Persisting in Zustand setter | `subscribe()` persistence middleware pattern | Middleware is broader than needed; a setter-local persistence path is simpler and easier to test here |
| Picker inside `MenuPopup` | Separate dialog launched from top-right button | Extra surface area and more tests for no real gain |
| Store-driven sprite source in `OfficePage` | Mutating `playerImgRef.current.src` from the picker | Cross-component imperative mutation is harder to reason about and test |

**Installation:** No new packages required.

## Architecture Patterns

### Pattern 1: Safe localStorage read/write inside store module
**What:** Read once at store initialization and write inside the `setSelectedPlayerCharacter()` action.
**When to use:** Persisting a small primitive preference that must be available before the first render.

```typescript
export const PLAYER_CHARACTER_STORAGE_KEY = 'cockpit.player.character.v1'

function readStoredPlayerCharacter(): CharacterType {
  if (typeof window === 'undefined') return 'astronaut'
  try {
    const raw = window.localStorage.getItem(PLAYER_CHARACTER_STORAGE_KEY)
    if (!raw || !CHARACTER_TYPES.includes(raw as CharacterType)) return 'astronaut'
    return raw as CharacterType
  } catch {
    return 'astronaut'
  }
}

setSelectedPlayerCharacter: (character) => {
  try { window.localStorage.setItem(PLAYER_CHARACTER_STORAGE_KEY, character) } catch {}
  set({ selectedPlayerCharacter: character })
}
```

This matches the project’s existing defensive localStorage pattern in `audioSystem.ts`.

### Pattern 2: Controlled wrap-around picker from `CHARACTER_TYPES`
**What:** Maintain a current index and compute previous/next with modulo arithmetic.
**When to use:** Cycling through a closed set of character identities.

```tsx
const index = CHARACTER_TYPES.indexOf(character)
const prev = CHARACTER_TYPES[(index - 1 + CHARACTER_TYPES.length) % CHARACTER_TYPES.length]
const next = CHARACTER_TYPES[(index + 1) % CHARACTER_TYPES.length]
```

The wrap-around rule is phase-critical and should be tested explicitly, not inferred.

### Pattern 3: State-driven player sprite source
**What:** Convert the player sprite image source from a hardcoded astronaut path into a value derived from `selectedPlayerCharacter`.
**When to use:** Any time the rendered player identity should react immediately to UI state.

```typescript
const selectedPlayerCharacter = useStore((s) => s.selectedPlayerCharacter)

useEffect(() => {
  const playerImg = new Image()
  playerImg.src = `/sprites/${selectedPlayerCharacter}-sheet.png`
  playerImgRef.current = playerImg
}, [selectedPlayerCharacter])
```

This keeps sprite identity declarative and avoids hidden coupling between `MenuPopup` and `OfficePage`.

### Pattern 4: Menu-integrated feature surface
**What:** Put character selection inside the existing `MenuPopup` as a dedicated section or mode.
**When to use:** A feature belongs in settings/menu chrome and the app already has a consistent shell.

The existing `MenuPopup` already owns user-facing settings. Character selection fits naturally there and satisfies the roadmap text of “top-bar or settings menu.”

### Anti-Patterns to Avoid

- **Hardcoding `'astronaut'` in `OfficePage` after adding store state**: this would make persistence appear broken even if the store saves correctly.
- **Using session-to-character mapping for the player**: `sessionToCharacter(sessionId)` is for NPC identity; the player needs explicit user choice.
- **Adding picker-local persistence without a store field**: `OfficePage` and `MenuPopup` would drift or need duplicate reads from localStorage.
- **Creating a second modal for the picker before proving the menu flow is insufficient**: unnecessary complexity.

## Common Pitfalls

### Pitfall 1: Invalid localStorage data
**What goes wrong:** Stored values can be stale or malformed and break initial state assumptions.
**How to avoid:** Validate against `CHARACTER_TYPES.includes(value)` and fall back to `'astronaut'`.

### Pitfall 2: Immediate update tied to “confirm” semantics
**What goes wrong:** If arrow clicks write directly to the global store, cancel/close behavior becomes ambiguous and the player sprite may change before confirmation.
**How to avoid:** Keep a local draft selection inside the picker or menu section, then commit on confirm.

### Pitfall 3: Image load race when changing characters quickly
**What goes wrong:** Multiple `Image` instances may be created as the selection changes.
**How to avoid:** Restrict store writes to explicit confirm and keep `OfficePage` image loading in a small effect keyed by the committed character.

### Pitfall 4: Missing tests for wrap-around
**What goes wrong:** Index math can accidentally stop at ends or skip entries.
**How to avoid:** Add direct tests for first→previous and last→next transitions in the picker test file.

## Code Examples

### Existing character source of truth
```typescript
// packages/ui/src/components/office/characterMapping.ts
export const CHARACTER_TYPES = [
  'astronaut',
  'robot',
  'alien',
  'hologram',
  'monkey',
  'caveman',
  'ghost',
  'ninja',
  'pirate',
  'medicine-woman',
] as const
```

### Existing menu/settings entry point
```tsx
// packages/ui/src/pages/OfficePage.tsx
<button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu">
  Menu
</button>
<MenuPopup open={menuOpen} onClose={() => setMenuOpen(false)} />
```

### Existing hardcoded player sprite source to replace
```typescript
// packages/ui/src/pages/OfficePage.tsx
const playerImg = new Image()
playerImg.src = '/sprites/astronaut-sheet.png'
playerImgRef.current = playerImg
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Hardcoded astronaut player sprite | Store-driven selected character with persistence | Enables user identity and reload restoration |
| Menu only contains audio settings | Menu also owns character selection | Reuses existing UI shell without navigation sprawl |

## Open Questions

1. **Should arrow clicks preview on-map immediately or only after confirm?**
   - Recommendation: keep arrows as local draft changes and commit on confirm. The roadmap explicitly calls out confirm for sprite update.

2. **Should the picker live inline in the existing menu or as a nested mode/page within the menu?**
   - Recommendation: start inline. If the layout becomes cramped, switch to a simple “character mode” section inside `MenuPopup`, not a new global dialog.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.x |
| Config file | `packages/ui/vitest.config.ts` |
| Quick run command | `pnpm --filter @cockpit/ui test -- CharacterPicker` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| character-selection | Store initializes from valid localStorage value and persists updates | unit | `pnpm --filter @cockpit/ui test -- uiSlice` | ✅ extend existing |
| character-selection | Picker arrows wrap and confirm emits selected character | unit | `pnpm --filter @cockpit/ui test -- CharacterPicker` | ❌ new |
| character-selection | Menu exposes picker entry point and forwards confirm | component | `pnpm --filter @cockpit/ui test -- MenuPopup` | ✅ extend existing |
| character-selection | OfficePage loads selected character sprite sheet | unit/component | `pnpm --filter @cockpit/ui test -- OfficePage` | ✅ extend existing |

## Recommendation

Implement the phase in three steps:

1. Store + persistence first, because both the picker and `OfficePage` need a stable source of truth.
2. CharacterPicker component next, fully tested in isolation.
3. MenuPopup + OfficePage wiring last, so the final plan only has to integrate existing primitives rather than invent them.
