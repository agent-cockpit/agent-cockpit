# Phase 13: Pixel Art Generation and Integration — Research

**Researched:** 2026-04-09
**Domain:** PixelLab MCP API + Node.js image processing + React sprite rendering
**Confidence:** HIGH (design brief locked, API spec confirmed, codebase fully read)

---

## Summary

Phase 13 executes against a fully locked design brief from Phase 10.2. All decisions (10 characters, 64px, 8 directions, space station theme, mixed animation strategy) are confirmed. The research question is therefore operational: how to call PixelLab MCP correctly, how to stitch individual frame PNGs into sprite sheets, and what changes are needed in `AgentSprite.tsx` and CSS.

The biggest architectural novelty is that Phase 10.2 was designed for a single character with south-only animation, but the locked brief has since expanded to **10 characters × 8 directions × 4 animation states** plus an idle row shared by 5 color-glow states. The sprite sheet layout must account for direction rows, not just state rows.

The sprite sheet stitching pipeline (`scripts/build-spritesheet.ts`) does not exist yet and must be created. The `public/sprites/` directory does not exist yet. `AgentSprite.tsx` currently hardcodes `agent-sheet.png` at 32px with no character mapping.

**Primary recommendation:** Build and validate the full pipeline end-to-end with the Astronaut character before generating any other characters. Gate bulk generation on pipeline verification.

---

<phase_requirements>
## Phase Requirements

Derived from success criteria (no explicit IDs provided):

| ID | Description | Research Support |
|----|-------------|-----------------|
| GEN-01 | All 10 character types generated: base sprite + idle + blocked/completed/failed animations, 8 directions, 64px | PixelLab MCP create_character + animate_character; budget manifest from 10.2-03 |
| GEN-02 | `public/sprites/{character}-sheet.png` exists for all 10 characters | Node.js sharp stitching pipeline; frame layout research below |
| GEN-03 | `AgentSprite.tsx` assigns character by sessionId hash, renders at 64px, supports 8 directions | sessionId hash formula locked in design brief; CSS background-position grid |
| GEN-04 | CSS state classes apply correct glow color for color-states and correct animation row for unique-animation states | State animation assignment table in design brief; CSS drop-shadow/box-shadow patterns |
| GEN-05 | Office Mode background renders the space station grid floor tileset | create_topdown_tileset or create_isometric_tile; CSS background-repeat |
| GEN-06 | All Tier 2/3 assets (icons, badges, loading animation) generated and wired | Budget manifest rows 25–64; create_map_object |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `sharp` | ^0.33 | PNG compositing for sprite sheet assembly | Industry standard Node.js image processing; supports buffer compositing without canvas API; handles alpha transparency; available in pnpm |
| PixelLab MCP | — | Character and asset generation | The only tool available; MCP server provides `create_character`, `animate_character`, `create_map_object`, `create_topdown_tileset` |
| `vitest` | ^3.0.0 | Test framework (already installed) | Existing project standard |
| React + Vite | existing | UI integration | Existing project stack; Vite serves `public/` at root |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `https`/`fetch` | built-in | Download frame PNGs from PixelLab CDN URLs | Required in build-spritesheet.ts |
| `tsx` / `ts-node` | existing in workspace | Run TypeScript scripts directly | For `scripts/build-spritesheet.ts` execution |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `sharp` | `jimp` | jimp is pure JS (no native bindings) — simpler install but slower and less reliable alpha handling |
| `sharp` | `node-canvas` | canvas requires Cairo native bindings — heavier install than sharp |
| `sharp` | `ffmpeg` | ffmpeg works for video sprite sheets but is overkill and not in the pnpm workspace |

**Installation:**
```bash
pnpm add sharp --filter @cockpit/ui
pnpm add -D @types/sharp --filter @cockpit/ui
```
Note: `sharp` requires native build. Add `sharp` to `onlyBuiltDependencies` in `pnpm-workspace.yaml`.

---

## Architecture Patterns

### Recommended Project Structure

```
packages/ui/
├── public/
│   └── sprites/                  # Vite serves this at /sprites/
│       ├── astronaut-sheet.png
│       ├── robot-sheet.png
│       ├── alien-sheet.png
│       ├── hologram-sheet.png
│       ├── monkey-sheet.png
│       ├── caveman-sheet.png
│       ├── ghost-sheet.png
│       ├── ninja-sheet.png
│       ├── pirate-sheet.png
│       └── medicine-woman-sheet.png
├── src/
│   └── components/office/
│       ├── AgentSprite.tsx       # UPDATE: multi-char, 64px, 8-dir
│       ├── spriteStates.ts       # UPDATE: add glow CSS, animation rows
│       └── characterMapping.ts  # NEW: sessionId→character hash
scripts/
├── build-spritesheet.ts          # NEW: PixelLab frame → sprite sheet
└── generation-log.md             # NEW: track generated character_ids
assets/
└── raw/                          # Downloaded raw frames from PixelLab
    ├── astronaut/
    │   ├── base/                 # rotation_urls per direction
    │   ├── idle/                 # animation frames per direction
    │   ├── blocked/
    │   ├── completed/
    │   └── failed/
    └── {character}/...
```

### Pattern 1: Sprite Sheet Layout (rows = states × directions)

**What:** Each character's sprite sheet is a PNG where rows encode `(state, direction)` pairs and columns encode animation frames.

**Layout spec (per character):**
```
Row 0:  idle south     (frames 0..N)
Row 1:  idle north
Row 2:  idle east
Row 3:  idle west
Row 4:  idle south-east
Row 5:  idle south-west
Row 6:  idle north-east
Row 7:  idle north-west
Row 8:  blocked south   ← unique animation
Row 9:  blocked north
Row 10: blocked east
Row 11: blocked west
Row 12: blocked south-east
Row 13: blocked south-west
Row 14: blocked north-east
Row 15: blocked north-west
Row 16: completed south ← unique animation
...
Row 24: failed south    ← unique animation
...
```

**Total rows:** 4 animation states × 8 directions = 32 rows per character.
**Row height:** 64px (or actual canvas output — see size notes below).
**Sheet width:** max_frames × 64px. Max frames is template-dependent (4–8 frames). Pad shorter animations with last frame to normalize width.

**CSS selector:**
```css
.agent-sprite {
  background-image: url('/sprites/astronaut-sheet.png');
  background-size: auto 100%;
  width: 64px;
  height: 64px;
  image-rendering: pixelated;
  background-position-y: calc(var(--sprite-row) * -64px);
  background-position-x: calc(var(--sprite-frame) * -64px);
}
```

**JavaScript animation loop:** `setInterval` or `requestAnimationFrame` increments `--sprite-frame` CSS variable, resetting at `frameCount` for that row.

### Pattern 2: SessionId → Character Mapping

Locked in design brief. Implemented in `characterMapping.ts`:

```typescript
// Source: .planning/phases/10.2-pixel-art-preproduction/10.2-04-DESIGN-DECISIONS.md
export const CHARACTER_TYPES = [
  'astronaut', 'robot', 'alien', 'hologram', 'monkey',
  'caveman', 'ghost', 'ninja', 'pirate', 'medicine-woman'
] as const

export type CharacterType = typeof CHARACTER_TYPES[number]

export function sessionToCharacter(sessionId: string): CharacterType {
  const index = parseInt(sessionId.slice(-4), 16) % CHARACTER_TYPES.length
  return CHARACTER_TYPES[index]
}
```

### Pattern 3: Direction → Sprite Row Mapping

```typescript
// Source: design brief Q3 — 8 directions
export const DIRECTION_ROWS: Record<Direction, number> = {
  south:      0,
  north:      1,
  east:       2,
  west:       3,
  'south-east': 4,
  'south-west': 5,
  'north-east': 6,
  'north-west': 7,
}

// State → base row offset (each state block = 8 rows for 8 directions)
export const STATE_ROW_OFFSET: Record<AnimationState, number> = {
  idle:      0,   // rows 0–7
  blocked:   8,   // rows 8–15
  completed: 16,  // rows 16–23
  failed:    24,  // rows 24–31
}

// 5 color states all use idle animation rows
export const COLOR_STATE_TO_ANIMATION: Record<AgentAnimState, AnimationState> = {
  planning:  'idle',
  coding:    'idle',
  reading:   'idle',
  testing:   'idle',
  waiting:   'idle',
  blocked:   'blocked',
  completed: 'completed',
  failed:    'failed',
}
```

### Pattern 4: Glow Colors via CSS Custom Properties

```css
/* Apply on the agent-sprite div via inline style or data attribute */
.sprite-planning  { --glow-color: #A371F7; }
.sprite-coding    { --glow-color: #58A6FF; }
.sprite-reading   { --glow-color: #39D353; }
.sprite-testing   { --glow-color: #E3B341; }
.sprite-waiting   { --glow-color: #6E7681; }
.sprite-blocked   { --glow-color: #FF4444; }
.sprite-completed { --glow-color: #2EA043; }
.sprite-failed    { --glow-color: #8B1E1E; }

.agent-sprite {
  filter: drop-shadow(0 0 4px var(--glow-color, transparent));
}
```

`filter: drop-shadow()` is preferred over `box-shadow` because it follows the sprite's alpha channel boundary rather than the bounding box.

### Pattern 5: PixelLab MCP Call Sequence (per character)

```
1. create_character(description, n_directions:8, size:64, ...)
   → returns { character_id, background_job_id }
2. poll get_character(character_id) until status != 'processing'
3. For each animation state [idle, blocked, completed, failed]:
   animate_character(character_id, template_animation_id, directions: ALL_8)
   → returns { background_job_id }
4. poll get_character(character_id) until all animations complete
5. For each animation state × direction:
   download all frame URLs → save to assets/raw/{character}/{state}/{direction}/frame-N.png
6. run build-spritesheet.ts {character}
   → reads assets/raw/{character}/**
   → writes packages/ui/public/sprites/{character}-sheet.png
```

### Pattern 6: Sharp-based Sprite Sheet Assembly

```typescript
// Source: sharp docs (verified via Context7)
import sharp from 'sharp'

async function stitchRow(framePaths: string[], frameSize: number): Promise<Buffer> {
  const width = framePaths.length * frameSize
  // Create transparent base
  const base = sharp({
    create: { width, height: frameSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
  const composites = framePaths.map((fp, i) => ({
    input: fp,
    left: i * frameSize,
    top: 0,
  }))
  return base.composite(composites).png().toBuffer()
}

async function buildSheet(rows: Buffer[], frameSize: number): Promise<void> {
  const height = rows.length * frameSize
  const width = rows[0].length / 4 / frameSize * frameSize // derive from buffer
  // ... vertical stacking of row buffers
}
```

### Anti-Patterns to Avoid

- **Hardcoding frame counts:** Template frame counts vary (4–8). The script must read actual frame count from `get_character` response, not assume a fixed number.
- **Using `box-shadow` for sprite glow:** `box-shadow` glows a rectangle. Use `filter: drop-shadow()` to follow the transparent sprite outline.
- **Generating all 10 characters before testing pipeline:** Generate Astronaut end-to-end first. If the stitching script or CSS layout is wrong, fix it before bulk generation wastes time.
- **Forgetting canvas size inflation:** PixelLab generates at `size × ~1.4` canvas. A `size: 64` request returns ~90px frames. The stitching script must crop to 64×64 or the CSS must use 90px grid.
- **Animating before character is approved:** Lock `character_id` from a reviewed prototype before queuing animation jobs.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PNG compositing | Custom PNG byte writer | `sharp` | PNG IHDR/IDAT chunk parsing is complex; alpha compositing has edge cases |
| Sprite animation loop | Manual setInterval with DOM writes | CSS custom property + Tailwind animation or inline style cycling | Lower paint cost; simpler coordination with React renders |
| PixelLab polling | Busy-wait loop | `await`-based poll with backoff (500ms initial, 2s after 3 retries) | PixelLab jobs take 2–5 minutes; tight loops waste API calls |
| SessionId hashing | Custom hash function | The `parseInt(sessionId.slice(-4), 16) % 10` formula from the design brief | Already specified; don't invent a new one |

**Key insight:** The complexity in Phase 13 is coordination, not computation. The sprite sheet assembly is simple image ops if sharp is used correctly. The CSS rendering is simple if rows and columns are laid out consistently.

---

## Common Pitfalls

### Pitfall 1: Canvas Size vs Character Size
**What goes wrong:** You request `size: 64` from PixelLab. The returned frames are ~90px wide × 90px tall (1.4× inflation). Stitching at 64px grid produces misaligned frames.
**Why it happens:** PixelLab adds padding around the character for visual breathing room.
**How to avoid:** After downloading frames, crop each to 64×64 center using sharp: `sharp(input).resize(64, 64, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } })`. Alternatively, use 90px grid throughout and update CSS accordingly.
**Warning signs:** Sprites appear with white/black borders or frames bleed into adjacent rows in the sheet.

### Pitfall 2: Inconsistent Frame Counts Between Animations
**What goes wrong:** `idle` has 6 frames, `blocked` has 8 frames. The sheet rows are different widths. CSS `background-position-x` animation wraps at the wrong frame.
**Why it happens:** PixelLab template animations have fixed but different frame counts.
**How to avoid:** Build sheet with `maxFrames = max(all animation frame counts)`. Pad shorter rows by repeating the last frame. Store per-state frame count in a JSON manifest alongside the sheet.
**Warning signs:** Animation loops with a "jump" at the end or freezes early.

### Pitfall 3: Character Style Drift Across 10 Characters
**What goes wrong:** Character 3 (Alien) looks like a completely different art style from Character 1 (Astronaut) — different outline weight, shading style, or color palette.
**Why it happens:** PixelLab `standard` mode has AI freedom that produces style variation.
**How to avoid:** Use identical style parameters for all 10 characters (`outline: single color black outline`, `shading: basic shading`, `detail: low`, `ai_freedom: 600`). If drift occurs, retry with lower `ai_freedom` (400) and explicit style anchors in description: "FTL crew member style, consistent pixel art outline".
**Warning signs:** Comparing two character sprites side-by-side shows different outline weight or highlight behavior.

### Pitfall 4: PixelLab Rate Limiting
**What goes wrong:** Batch-queuing all 10 characters simultaneously triggers 429 Too Many Requests.
**Why it happens:** PixelLab limits concurrent jobs (exact limit not documented; conservative estimate 3–5).
**How to avoid:** Queue one character's full animation set, wait for completion, then queue the next. Implement retry-after logic in the generation script.
**Warning signs:** Errors in generation log with HTTP 429 responses.

### Pitfall 5: `sharp` Native Build Failure in pnpm
**What goes wrong:** `pnpm install` fails for `sharp` because the native module is not in `onlyBuiltDependencies`.
**Why it happens:** pnpm v10 blocks native builds unless explicitly listed.
**How to avoid:** Add `sharp` to `onlyBuiltDependencies` in `pnpm-workspace.yaml` before installing.
**Warning signs:** `sharp` installs but throws `Cannot find module '@img/sharp-darwin-arm64'` at runtime.

### Pitfall 6: AgentSprite Direction = Always South
**What goes wrong:** The design brief specifies 8-direction sprites, but `AgentSprite.tsx` doesn't know which direction the agent is facing — it has no directional state.
**Why it happens:** `OfficePage` tracks drag position but not velocity/direction.
**How to avoid:** For Phase 13, default all sprites to `south` direction. Add a `direction` prop to `AgentSprite` with default `'south'`. The OfficePage drag handler can derive direction from drag delta in a future phase. This keeps Phase 13 achievable without adding drag-direction logic.
**Warning signs:** Direction prop is missing or always undefined.

---

## Code Examples

### PixelLab MCP — create_character (correct parameters for Phase 13)

```typescript
// Source: 10.2-04-DESIGN-DECISIONS.md (locked brief) + 10.2-01-ANIMATION-RESEARCH.md
// Call via MCP tool — not a direct HTTP call from application code
const params = {
  description: "astronaut in white NASA space suit with orange visor stripe, helmet on, walking pose, pixel art, space station crew member",
  body_type: "humanoid",
  n_directions: 8,        // 8 directions: N, NE, E, SE, S, SW, W, NW
  size: 64,               // 64px character size (canvas will be ~90px)
  proportions: '{"type":"preset","name":"chibi"}',
  outline: "single color black outline",
  shading: "basic shading",
  detail: "low detail",
  ai_freedom: 600,
  view: "low top-down",
  mode: "standard"        // 1 generation flat; never use pro
}
```

### PixelLab MCP — animate_character (blocked, all 8 directions)

```typescript
// Source: 10.2-04-DESIGN-DECISIONS.md state animation specification
const blockedParams = {
  character_id: LOCKED_CHARACTER_ID,
  template_animation_id: "fight-stance-idle-8-frames",  // primary; fallback: "scary-walk"
  directions: ["south", "north", "east", "west", "south-east", "south-west", "north-east", "north-west"],
  // action_description not needed for template mode
}
// Cost: 8 generations (1 per direction)

const completedParams = {
  character_id: LOCKED_CHARACTER_ID,
  template_animation_id: "jumping-1",  // primary; fallback: "two-footed-jump"
  directions: ["south", "north", "east", "west", "south-east", "south-west", "north-east", "north-west"],
}

const failedParams = {
  character_id: LOCKED_CHARACTER_ID,
  template_animation_id: "falling-back-death",  // primary; fallback: "taking-punch"
  directions: ["south", "north", "east", "west", "south-east", "south-west", "north-east", "north-west"],
}

const idleParams = {
  character_id: LOCKED_CHARACTER_ID,
  template_animation_id: "breathing-idle",  // shared for all 5 color states
  directions: ["south", "north", "east", "west", "south-east", "south-west", "north-east", "north-west"],
}
```

### Sharp Sprite Sheet Assembly

```typescript
// Source: sharp docs — composite API
import sharp from 'sharp'
import path from 'node:path'

const FRAME_SIZE = 64  // After cropping from ~90px canvas

async function downloadAndCrop(url: string, dest: string): Promise<void> {
  const res = await fetch(url)
  const buffer = Buffer.from(await res.arrayBuffer())
  await sharp(buffer)
    .resize(FRAME_SIZE, FRAME_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(dest)
}

async function buildRow(framePaths: string[], maxFrames: number): Promise<Buffer> {
  const width = maxFrames * FRAME_SIZE
  const composites = framePaths.map((fp, i) => ({ input: fp, left: i * FRAME_SIZE, top: 0 }))
  // Pad by repeating last frame if needed
  const lastFrame = framePaths[framePaths.length - 1]
  for (let i = framePaths.length; i < maxFrames; i++) {
    composites.push({ input: lastFrame, left: i * FRAME_SIZE, top: 0 })
  }
  return sharp({
    create: { width, height: FRAME_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite(composites).png().toBuffer()
}
```

### Updated AgentSprite.tsx (key changes only)

```typescript
// Current: hardcoded agent-sheet.png at 32px
// New: character-specific sheet at 64px with row/direction support

import { sessionToCharacter } from './characterMapping.js'
import { STATE_ROW_OFFSET, COLOR_STATE_TO_ANIMATION, DIRECTION_ROWS } from './spriteStates.js'

// Inside AgentSprite component:
const characterType = sessionToCharacter(session.sessionId)
const animState = COLOR_STATE_TO_ANIMATION[agentState]
const direction = props.direction ?? 'south'
const stateRow = STATE_ROW_OFFSET[animState]
const dirRow = DIRECTION_ROWS[direction]
const spriteRow = stateRow + dirRow

// Render div style:
style={{
  backgroundImage: `url('/sprites/${characterType}-sheet.png')`,
  backgroundPositionY: `${spriteRow * -64}px`,
  backgroundPositionX: `0px`,  // frame cycling via JS animation loop
  imageRendering: 'pixelated',
  width: 64,
  height: 64,
}}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single `agent-sheet.png` hardcoded | 10 character-specific sheets at `/sprites/{character}-sheet.png` | Phase 13 | URL is dynamic based on sessionId hash |
| 32px sprite, south-only, no directions | 64px sprite, 8-direction row layout | Phase 13 | CSS background-position must use 64px grid |
| CSS class selects state row only | CSS class selects glow color; row computed from state + direction | Phase 13 | Row = `STATE_ROW_OFFSET[animState] + DIRECTION_ROWS[direction]` |
| No animation loop | JS animation loop cycles `backgroundPositionX` per frame | Phase 13 | Frame count per state must be stored in manifest JSON |

---

## Open Questions

1. **Exact canvas output size for `size: 64`**
   - What we know: API research found ~1.4× inflation (size:32 → ~45px). For size:64 that would be ~90px.
   - What's unclear: The exact multiplier — it may vary by character complexity.
   - Recommendation: After generating the first Astronaut prototype, measure actual frame dimensions. If it's not exactly 64px, update the stitching script accordingly. Using `fit: 'contain'` in sharp handles this gracefully.

2. **Whether `fight-stance-idle-8-frames` template supports 8 directions**
   - What we know: Template mode defaults to all directions the character was created with. The template name suggests 8 frames but does not specify direction support.
   - What's unclear: Whether diagonal directions (NE, SE, SW, NW) are generated for this specific template.
   - Recommendation: Test with Astronaut before bulk generation. Fallback is `scary-walk` which has clearer multi-direction support.

3. **PixelLab MCP tool name for polling**
   - What we know: `get_character(character_id)` is the documented polling method. The MCP server is not currently configured in this project (no `.mcp.json`).
   - What's unclear: Whether the MCP server needs to be added to `.mcp.json` for Phase 13 — and what the exact tool name is in the Claude Code MCP namespace.
   - Recommendation: Plan 00 should verify MCP connectivity before generating. The MCP system prompt indicates it's available as `pixellab` server with tools `create_character`, `animate_character`, `get_character`, `create_map_object`, `create_topdown_tileset`.

4. **Animation frame cycling — React approach**
   - What we know: CSS alone can't cycle `background-position-x` without a fixed frame count hardcoded in CSS keyframes. Frame counts vary per animation.
   - What's unclear: The cleanest React approach — `useInterval` hook with `useState` for current frame, or CSS animation with `steps()` using inline `@keyframes`.
   - Recommendation: Use a `useEffect` + `setInterval` in `AgentSprite.tsx` that reads `frameCount` from a manifest JSON (`/sprites/{character}-manifest.json`) fetched once per character. This keeps CSS clean and frame counts dynamic.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x + React Testing Library |
| Config file | `packages/ui/vitest.config.ts` |
| Quick run command | `pnpm --filter @cockpit/ui test --run` |
| Full suite command | `pnpm --filter @cockpit/ui test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GEN-01 | PixelLab generation calls succeed for each character | manual / smoke | verify PNG files exist in `assets/raw/` | ❌ Wave 0: `scripts/` dir |
| GEN-02 | `public/sprites/{character}-sheet.png` exists for all 10 characters | file existence check | `node scripts/verify-sprites.ts` — checks all 10 files exist and are non-zero bytes | ❌ Wave 0 |
| GEN-03 | `sessionToCharacter` returns stable correct character for any sessionId | unit | `pnpm --filter @cockpit/ui test --run characterMapping` | ❌ Wave 0: `__tests__/characterMapping.test.ts` |
| GEN-03 | `AgentSprite.tsx` renders at 64px with character-specific sheet URL | unit | `pnpm --filter @cockpit/ui test --run AgentSprite` | ✅ exists — needs update |
| GEN-04 | CSS glow colors applied per state; animation row computed correctly | unit | `pnpm --filter @cockpit/ui test --run spriteStates` | ✅ exists — needs extension |
| GEN-05 | OfficePage renders background tile CSS | unit / visual | `pnpm --filter @cockpit/ui test --run OfficePage` | ✅ exists — needs extension |
| GEN-06 | Icon PNG files exist at expected paths | file existence check | `node scripts/verify-sprites.ts` (extended) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @cockpit/ui test --run`
- **Per wave merge:** `pnpm --filter @cockpit/ui test --run`
- **Phase gate:** All tests green + all 10 sprite sheet PNGs verified to exist before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/ui/src/__tests__/characterMapping.test.ts` — covers GEN-03 sessionId hashing
- [ ] `packages/ui/src/components/office/characterMapping.ts` — the module under test
- [ ] `scripts/verify-sprites.ts` — file existence check for GEN-02, GEN-06
- [ ] `scripts/build-spritesheet.ts` — core generation pipeline (not a test file — implementation)
- [ ] `packages/ui/public/sprites/` directory — must exist before Vite build

---

## PixelLab MCP Reference

### Tools Available (from MCP server init context)

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `create_character` | Generate base character in N directions | `description`, `n_directions: 8`, `size: 64`, `proportions: chibi`, `mode: standard` |
| `animate_character` | Add animation to existing character | `character_id`, `template_animation_id`, `directions: [all 8]` |
| `get_character` | Poll job status + retrieve frame URLs | `character_id`, `include_preview: true` |
| `create_map_object` | Generate icons and decorations | `description`, `width`, `height`, `view` |
| `create_topdown_tileset` | Generate Wang tile set (16 tiles) | `description`, `size`, `shading`, `detail` |

### Animation Templates for Phase 13

| State | Primary Template | Fallback | Cost (8 dirs) |
|-------|-----------------|----------|---------------|
| idle (shared for 5 color states) | `breathing-idle` | `fight-stance-idle-8-frames` | 8 gen |
| blocked | `fight-stance-idle-8-frames` | `scary-walk` | 8 gen |
| completed | `jumping-1` | `two-footed-jump` | 8 gen |
| failed | `falling-back-death` | `taking-punch` | 8 gen |

### Cost Summary for Phase 13 (Updated for 8-direction × 10 characters)

| Operation | Count | Cost | Running Total |
|-----------|-------|------|---------------|
| Base characters (10) | 10 × 1 | 10 gen | 10 |
| Idle animation (10 chars × 8 dirs) | 80 | 80 gen | 90 |
| Blocked animation (10 chars × 8 dirs) | 80 | 80 gen | 170 |
| Completed animation (10 chars × 8 dirs) | 80 | 80 gen | 250 |
| Failed animation (10 chars × 8 dirs) | 80 | 80 gen | 330 |
| Prototype retries (buffer) | ~20 | 20 gen | 350 |
| Floor tileset | 4 | 4 gen | 354 |
| Panel icons + badges (Tier 2/3) | ~26 | 26 gen | 380 |
| **TOTAL** | | **~380 gen** | **of 2000 budget** |

Budget remaining after Phase 13: ~1620 images. Risk is near-zero.

---

## Key Design Brief Values (Extracted for Planner)

### Character Descriptions (verbatim from brief)

| Character | `description` field |
|-----------|---------------------|
| astronaut | "astronaut in white NASA space suit with orange visor stripe, helmet on, walking pose, pixel art, space station crew member" |
| robot | "metallic android robot with LED eye panel, antenna, articulated joints, silver and blue, pixel art, sci-fi AI unit" |
| alien | "small green alien with large black oval eyes, 4 fingers, minimal clothing, curious expression, pixel art, xenobiologist" |
| hologram | "translucent blue holographic humanoid, scan lines visible, glowing edges, slightly transparent, pixel art, AI interface projection" |
| monkey | "chimpanzee in a white space suit, helmet under arm, curious expression, pixel art, retro NASA test primate" |
| caveman | "caveman wearing a space helmet over fur loincloth, club in hand, confused expression, pixel art, comic contrast character" |
| ghost | "friendly ghost wearing a tiny astronaut helmet, translucent white with slight blue glow, floating, pixel art" |
| ninja | "ninja in black tactical suit, face mask, shuriken on belt, crouching ready stance, pixel art, stealth operative" |
| pirate | "space pirate with eyepatch, captain hat, hook hand, worn jacket, pixel art, rogue contractor crew member" |
| medicine-woman | "medicine woman in traditional headdress combined with space suit elements, medicine bag, wise expression, pixel art, chief medical officer" |

### State Glow Colors (verbatim from brief)

| State | Hex |
|-------|-----|
| planning | `#A371F7` |
| coding | `#58A6FF` |
| reading | `#39D353` |
| testing | `#E3B341` |
| waiting | `#6E7681` |
| blocked | `#FF4444` |
| completed | `#2EA043` |
| failed | `#8B1E1E` |

### Sprite Sheet Render Parameters

| Property | Value | Source |
|----------|-------|--------|
| Character size request | 64px | Design brief Q3 |
| Canvas output actual | ~90px (64 × 1.4) | Animation research |
| Sprite rendered at | 64×64px (crop/contain in sharp) | Design brief Q3 |
| Directions | 8 | Design brief Q3 |
| Unique animation states | blocked, completed, failed | Design brief Q4 |
| Color-only states | planning, coding, reading, testing, waiting | Design brief Q4 |
| Background tile tool | `create_topdown_tileset` | Design brief Q5 |
| Proportions | chibi | Design brief + research recommendation |
| Outline | single color black outline | Design brief |
| Shading | basic shading | Design brief |
| Detail | low | Design brief (clean at small sizes) |
| View | low top-down | Design brief |
| Mode | standard | Design brief (1 gen flat) |

---

## Sources

### Primary (HIGH confidence)
- `.planning/phases/10.2-pixel-art-preproduction/10.2-04-DESIGN-DECISIONS.md` — locked design brief, all character specs
- `.planning/phases/10.2-pixel-art-preproduction/10.2-01-ANIMATION-RESEARCH.md` — PixelLab API spec, costs, output format
- `.planning/phases/10.2-pixel-art-preproduction/10.2-03-BUDGET-PLAN.md` — generation manifest, integration notes
- `packages/ui/src/components/office/AgentSprite.tsx` — current implementation (read directly)
- `packages/ui/src/components/office/spriteStates.ts` — current CSS class and state system (read directly)
- `packages/ui/src/pages/OfficePage.tsx` — current Office Mode render (read directly)
- MCP server init context — confirms PixelLab tools available: `create_character`, `animate_character`, `get_character`, `create_map_object`, `create_topdown_tileset`

### Secondary (MEDIUM confidence)
- `sharp` npm package — PNG compositing approach; known stable library at v0.33; native build requirement for pnpm confirmed from prior project decisions in STATE.md

### Tertiary (LOW confidence)
- Frame count behavior for diagonal directions on specific templates (`fight-stance-idle-8-frames`) — stated as template default but not explicitly verified for all 8 diagonal combinations

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — design brief locked, codebase fully read, PixelLab API spec confirmed
- Architecture: HIGH — sprite sheet layout derived directly from locked brief; sharp pattern is standard
- Pitfalls: HIGH — canvas inflation, frame count variance, and sharp pnpm build are well-documented in prior research
- PixelLab MCP tool names: HIGH — confirmed in MCP server init context for this session

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (PixelLab API is stable; design brief is locked and cannot change)
