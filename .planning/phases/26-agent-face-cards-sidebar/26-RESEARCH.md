# Phase 26: Agent Face Cards in Sidebar - Research

**Researched:** 2026-04-14
**Domain:** React UI component, static asset pipeline, image fallback patterns
**Confidence:** HIGH

## Summary

This phase is purely a UI enhancement with no backend changes. All 10 face PNGs already exist at `assets/raw/{character}/face/` as raw screenshot files with non-normalized filenames (e.g. `Screenshot Apr 14 2026 from remove.bg (9).png`). They must be copied and renamed to a canonical pattern before the browser can load them.

The project already has an established asset pipeline pattern: a Node/sharp script at `scripts/build-spritesheet.ts` copies and transforms raw assets into `packages/ui/public/sprites/`. Face images follow the same destination convention — they go to `public/sprites/faces/{character}-face.png`. No new tooling is needed; a small copy script (or a Node script using `fs.copyFile`) using `tsx` suffices.

The React side is minimal: add a `characterFaceUrl(character)` helper in `characterMapping.ts`, call `sessionToCharacter()` in `MapSidebar.tsx` (already used in `AgentSprite.tsx`), render a 32×32 `<img>` element with an `onError` fallback to a character-initial text element. The existing test suite structure (`MapSidebar.test.tsx`) already mocks `useActiveSessions` and `useStore` — the new tests follow the same pattern.

**Primary recommendation:** Write a standalone copy script (`scripts/copy-faces.ts`) using `tsx` that reads `assets/raw/{character}/face/` for each character, copies the single PNG file found there to `packages/ui/public/sprites/faces/{character}-face.png`, add a root-level npm script `copy-faces` for it, then wire `characterFaceUrl()` + `<img onError>` fallback into `MapSidebar.tsx`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| sidebar-face-card | Each session row in the sidebar displays the agent's character face portrait as a 32×32 rounded avatar, with graceful fallback on load error, without breaking existing sidebar layout | Copy script publishes face PNGs to `public/sprites/faces/`; `characterFaceUrl()` helper provides URL; `<img onError>` pattern provides fallback; existing sidebar layout untouched beyond adding a leading avatar column |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 18 | 18.3.x | Component rendering | Project stack |
| Tailwind v4 | 4.x | Utility classes for sizing/rounding | Project stack |
| tsx | latest (devDep at root) | Run TypeScript scripts without compile step | Already used for `build-spritesheet.ts` |
| Node `fs/promises` | Node built-in | File copy in build script | Already used in `build-spritesheet.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sharp | 0.34.x | Image transform | Only needed if face PNGs must be resized/cropped; raw screenshots may be full-size portraits — can use plain `fs.copyFile` if dimensions are acceptable |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate copy script | Vite `assetsInclude` or `publicDir` aliasing | Vite doesn't automatically rename files; copy script is explicit and matches existing project pattern |
| `fs.copyFile` | `sharp` resize | If face PNG dimensions need normalizing to a square, use sharp; otherwise plain copy is simpler |

**Installation:** No new packages required. `tsx` and `sharp` already present.

## Architecture Patterns

### Recommended Project Structure
```
scripts/
└── copy-faces.ts         # new: copies + renames face PNGs to public/sprites/faces/

packages/ui/public/sprites/
└── faces/
    ├── astronaut-face.png
    ├── robot-face.png
    ├── alien-face.png
    ├── hologram-face.png
    ├── monkey-face.png
    ├── caveman-face.png
    ├── ghost-face.png
    ├── ninja-face.png
    ├── pirate-face.png
    └── medicine-woman-face.png

packages/ui/src/components/office/
└── characterMapping.ts   # add: export function characterFaceUrl(character)

packages/ui/src/components/layout/
└── MapSidebar.tsx        # modify: import sessionToCharacter + characterFaceUrl, render avatar
    __tests__/
    └── MapSidebar.test.tsx   # extend: face avatar rendering + fallback tests
```

### Pattern 1: Asset URL Helper in characterMapping.ts
**What:** A pure function that returns the public URL path for a face image, co-located with `sessionToCharacter`.
**When to use:** Any component that needs to display an agent face by character type.
```typescript
// packages/ui/src/components/office/characterMapping.ts
export function characterFaceUrl(character: CharacterType): string {
  return `/sprites/faces/${character}-face.png`
}
```
This matches the existing URL pattern: `/sprites/${characterType}-sheet.png` used in `AgentSprite.tsx`.

### Pattern 2: Image with onError Fallback
**What:** React `<img>` element that falls back to a styled text initial on load error.
**When to use:** Any image that has a known-good URL but may fail (missing file, network error).
```tsx
// Controlled via local state to swap <img> → <span> on error
const [imgFailed, setImgFailed] = useState(false)
const character = sessionToCharacter(session.sessionId)

{!imgFailed ? (
  <img
    src={characterFaceUrl(character)}
    alt={character}
    width={32}
    height={32}
    onError={() => setImgFailed(true)}
    style={{ imageRendering: 'pixelated' }}
    className="shrink-0 rounded-full object-cover"
  />
) : (
  <span
    aria-label={character}
    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-bold uppercase text-cyan-300"
  >
    {character[0]}
  </span>
)}
```
The `useState(false)` per-row pattern is correct; each session row manages its own fallback state independently.

### Pattern 3: Copy Script (scripts/copy-faces.ts)
**What:** A standalone script that iterates `CHARACTER_TYPES`, finds the single PNG in `assets/raw/{char}/face/`, and copies it to the destination with a canonical filename.
**When to use:** Run once before dev/build to publish face assets.
```typescript
// scripts/copy-faces.ts
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHARACTER_TYPES } from '../packages/ui/src/components/office/characterMapping.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'packages/ui/public/sprites/faces')

await fs.mkdir(OUT, { recursive: true })
for (const char of CHARACTER_TYPES) {
  const srcDir = path.join(ROOT, 'assets/raw', char, 'face')
  const entries = (await fs.readdir(srcDir)).filter(f => f.endsWith('.png'))
  if (entries.length === 0) throw new Error(`No face PNG found for ${char}`)
  await fs.copyFile(path.join(srcDir, entries[0]), path.join(OUT, `${char}-face.png`))
  console.log(`Copied ${char}-face.png`)
}
```
Invoke via: `npx tsx scripts/copy-faces.ts` or root-package npm script `"copy-faces": "tsx scripts/copy-faces.ts"`.

### Anti-Patterns to Avoid
- **Importing CHARACTER_TYPES into the copy script at runtime via tsx:** tsx can run TypeScript ESM directly; the import path just needs the `.js` extension to match the tsconfig paths convention already used in the project.
- **Using `onError` to set state inside `rows.map()` without per-row state:** Each row must own independent state; a single `useState` at component level will not work for multiple rows. Use a child component or per-row key pattern.
- **Hard-coding the face subdirectory URL with `/sprites/{character}-face.png`** (flat): The STUB specifies `/sprites/faces/{character}-face.png` — use the `faces/` subdirectory to keep sprites organized.
- **Placing face PNGs in `assets/` directly served by Vite:** All public assets must be in `packages/ui/public/` to be served at root paths in production.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image fallback on broken src | Custom error boundary, global image error handler | `onError` prop on `<img>` | Native DOM event, zero overhead |
| Asset copy/rename | Vite plugin, webpack loader | Node `fs.copyFile` script via `tsx` | Already project pattern; Vite doesn't rename |
| Character → URL mapping | Inline template literals scattered in components | `characterFaceUrl()` helper in `characterMapping.ts` | Keeps mapping centralized; already the pattern for sprite sheets |

## Common Pitfalls

### Pitfall 1: Raw face filenames contain spaces and parentheses
**What goes wrong:** `fs.readdir` returns filenames like `Screenshot Apr 14 2026 from remove.bg (9).png`. Using the raw name as a URL will produce a 404 in the browser.
**Why it happens:** Assets were saved directly from a remove.bg screenshot workflow without renaming.
**How to avoid:** The copy script renames to `{character}-face.png` at copy time — never reference the raw filename in any URL.
**Warning signs:** Browser console shows 404 for face images.

### Pitfall 2: Per-row `onError` state inside `rows.map()`
**What goes wrong:** If `imgFailed` state is declared at the `MapSidebar` component level as a single boolean, all rows share the same fallback flag.
**Why it happens:** Lifting state too high.
**How to avoid:** Extract a `SessionRow` sub-component that owns `const [imgFailed, setImgFailed] = useState(false)` independently, or use a `Map<sessionId, boolean>` in one `useState`. The cleanest approach is a small `FaceAvatar` component.
**Warning signs:** One broken image causes all rows to show the text initial.

### Pitfall 3: Missing `faces/` subdirectory in public
**What goes wrong:** `fs.mkdir(OUT, { recursive: true })` in the copy script will create the directory, but if the copy script is never run, the browser will 404 on all face images.
**Why it happens:** Developer runs `pnpm dev` without running `copy-faces` first.
**How to avoid:** Document the setup step in STUB/README, or have the copy script run as part of the dev setup. The fallback (character initial) will display gracefully anyway.
**Warning signs:** All face images show character-initial fallbacks on first dev startup.

### Pitfall 4: `imageRendering: pixelated` needed for crisp rendering
**What goes wrong:** Pixel art face PNGs scaled to 32×32 appear blurry due to browser bilinear interpolation.
**Why it happens:** Default CSS image rendering is smooth.
**How to avoid:** Add `style={{ imageRendering: 'pixelated' }}` to the `<img>` element, matching the existing `RiskBadge.tsx` pattern.

## Code Examples

### Existing sprite URL pattern (AgentSprite.tsx)
```typescript
// Source: packages/ui/src/components/office/AgentSprite.tsx line 46
const src = `/sprites/${characterType}-sheet.png`
```
Face URL follows the same convention: `/sprites/faces/${character}-face.png`.

### Existing image element with pixelated rendering (RiskBadge.tsx)
```tsx
// Source: packages/ui/src/components/RiskBadge.tsx
<img
  src={`/sprites/badge-${level}.png`}
  alt={`${level} risk`}
  style={{ imageRendering: 'pixelated' }}
  className={className}
/>
```
Face avatar adds `onError`, `width`, `height`, and Tailwind `rounded-full object-cover`.

### Existing MapSidebar row layout (inner div, line 96)
```tsx
// Source: packages/ui/src/components/layout/MapSidebar.tsx line 96
<div className="flex items-start justify-between gap-3">
  <div className="min-w-0">
    ...project name, status...
  </div>
  {session.pendingApprovals > 0 && <span>pill</span>}
</div>
```
The face avatar is inserted as the first element inside the outer `flex` div, before the `min-w-0` content div. This preserves all existing elements unchanged.

### Existing vitest mock pattern for MapSidebar tests
```typescript
// Source: packages/ui/src/components/layout/__tests__/MapSidebar.test.tsx
vi.mock('../../../store/selectors.js', () => ({
  useActiveSessions: () => mockRefs.mockSessions,
}))
```
New tests for face avatar follow same `vi.mock` + `makeSession()` pattern. Add a `vi.mock` for `characterMapping.js` to pin face URL in tests, or mock `HTMLImageElement` load/error behavior via `fireEvent.error`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| N/A — no face images in sidebar | Add face avatar as first element in session row | Phase 26 | Visual identity per agent at a glance |

**Deprecated/outdated:**
- None relevant to this phase.

## Open Questions

1. **Face PNG dimensions**
   - What we know: Files are screenshots from remove.bg, ranging 13–24 KB. Likely portrait orientation (non-square).
   - What's unclear: Exact pixel dimensions — could be 200×200 or 512×600.
   - Recommendation: If non-square, use `sharp` in the copy script with `.resize(64, 64, { fit: 'cover' })` to produce square crops; 64×64 stored, displayed at 32×32 via CSS. If already approximately square, `fs.copyFile` is sufficient. The copy script should check and handle both.

2. **sharp resize vs plain copy**
   - What we know: `sharp` is already in devDependencies of `packages/ui`.
   - What's unclear: Whether raw face PNGs need resizing for a crisp 32×32 display.
   - Recommendation: Use `sharp` with `.resize(64, 64, { fit: 'cover' }).png()` to normalize all faces to 64×64 square at copy time. This matches the sprite sheet FRAME_SIZE and will render sharply at 32×32.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.x |
| Config file | `packages/ui/vitest.config.ts` (root `vitest.config.ts` for full suite) |
| Quick run command | `pnpm --filter @cockpit/ui test -- --reporter=verbose packages/ui/src/components/layout/__tests__/MapSidebar.test.tsx` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| sidebar-face-card | Face avatar img renders for each session row | unit | `pnpm --filter @cockpit/ui test -- MapSidebar` | ✅ (extend existing) |
| sidebar-face-card | Fallback text initial renders when img onError fires | unit | `pnpm --filter @cockpit/ui test -- MapSidebar` | ✅ (extend existing) |
| sidebar-face-card | characterFaceUrl returns correct path for each character | unit | `pnpm --filter @cockpit/ui test -- characterMapping` | ✅ (extend existing) |
| sidebar-face-card | Existing sidebar layout (status dot, provider badge, approvals pill) unchanged | unit | `pnpm --filter @cockpit/ui test -- MapSidebar` | ✅ (existing tests verify) |

### Sampling Rate
- **Per task commit:** `pnpm --filter @cockpit/ui test -- MapSidebar`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements. The copy script itself has no automated tests (it's a one-shot build tool); manual verification is `ls packages/ui/public/sprites/faces/`.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `packages/ui/src/components/office/characterMapping.ts` — `sessionToCharacter` function, `CHARACTER_TYPES` array
- Direct codebase inspection: `packages/ui/src/components/layout/MapSidebar.tsx` — current row layout, Tailwind classes, test structure
- Direct codebase inspection: `packages/ui/src/components/office/AgentSprite.tsx` — sprite URL pattern `/sprites/${characterType}-sheet.png`
- Direct codebase inspection: `packages/ui/src/components/RiskBadge.tsx` — `<img style={{ imageRendering: 'pixelated' }}` pattern
- Direct asset inspection: `assets/raw/*/face/` — confirmed all 10 face PNGs present, non-normalized filenames with spaces
- Direct inspection: `packages/ui/public/sprites/` — confirmed `faces/` subdirectory does NOT yet exist
- Direct inspection: `scripts/build-spritesheet.ts` — established pattern for Node/sharp asset pipeline scripts
- Direct inspection: `package.json` (root) — `tsx` available as devDep, `pnpm run copy-faces` is the right invocation pattern
- Direct inspection: `.planning/config.json` — `nyquist_validation: true` confirmed

### Secondary (MEDIUM confidence)
- React `onError` image fallback pattern — standard HTML/React DOM event, stable API

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are already installed in the project
- Architecture: HIGH — patterns directly extrapolated from existing codebase code (AgentSprite.tsx, RiskBadge.tsx, MapSidebar.tsx)
- Pitfalls: HIGH — discovered through direct asset inspection (non-normalized filenames) and code analysis

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable stack, no external dependencies)
