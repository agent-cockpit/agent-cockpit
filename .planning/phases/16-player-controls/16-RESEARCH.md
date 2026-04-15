# Phase 16: Player Controls - Research

**Researched:** 2026-04-10
**Domain:** Browser keyboard/mouse input, canvas game loop integration, sprite direction mapping
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| player-movement | WASD and arrow keys move the player character at a consistent speed (frame-rate independent), with 8-directional sprite facing, world bounds enforcement | Keyboard Set polling pattern in update(); deltaMs-based displacement; DIRECTION_ROWS already maps all 8 directions; world bounds clamping analogous to camera clamping |
| click-to-teleport | Clicking an agent on the map instantly moves the camera to center on that agent | Extend existing canvas click handler in OfficePage; set camera targetX/Y = npc.x - viewportW/2; teleport is instant, no lerp needed |
| input-tracking | Keyboard input must not conflict with text inputs or modal popups | `document.activeElement` instanceof HTMLInputElement/HTMLTextAreaElement guard; `e.target` check on keydown; focus-aware suppression pattern |
</phase_requirements>

---

## Summary

Phase 16 adds player-controlled character movement to the existing canvas game loop established in Phase 15. The architecture is already well-suited: `GameEngine` provides an `update(deltaMs)` hook that fires every rAF frame, `gameState.player` already holds `{ x, y, direction }`, and `DIRECTION_ROWS` already maps all 8 directions including diagonals. No new dependencies are required.

The keyboard input pattern that fits this architecture is a **held-key Set** (`keysDown: Set<string>`): `keydown` adds a key code, `keyup` removes it. Each `update()` call reads the set, computes dx/dy, derives direction, moves the player, clamps to world bounds, and updates the camera target. This approach is frame-rate independent when combined with the existing deltaMs, decouples event registration from game logic, and trivially supports simultaneous key presses (diagonals).

Input conflict prevention is the most nuanced concern. The standard browser pattern is to check `document.activeElement` before consuming the keydown event — if focus is in an input, textarea, select, or contenteditable, the game should ignore it. The existing popup system (`InstancePopupHub`) renders outside the canvas, so a focused element check is sufficient without any additional modal-tracking state.

**Primary recommendation:** Add a `PlayerInput` module (`packages/ui/src/game/PlayerInput.ts`) that owns the keysDown Set and lifecycle (attach/detach), and a `movePlayer()` pure function consumed by the OfficePage engine's `update()` override. Draw the player on canvas in `render()` using the same `drawAgentSprite` blit pattern, rendered after NPCs so the player appears on top (z-order = draw order on canvas).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| None new | — | All logic is plain TypeScript in existing rAF loop | No external input library needed; browser KeyboardEvent API is sufficient |

### Supporting (already present)
| Module | Path | Purpose |
|--------|------|---------|
| `GameEngine` | `packages/ui/src/game/GameEngine.ts` | rAF loop, `update(deltaMs)` + `render()` hooks |
| `GameState` | `packages/ui/src/game/GameState.ts` | `gameState.player.{x,y,direction}`, singleton |
| `Camera` | `packages/ui/src/game/Camera.ts` | `updateCamera()`, `targetX/Y` for teleport |
| `DIRECTION_ROWS` | `packages/ui/src/components/office/spriteStates.ts` | Maps 8 directions to sprite sheet rows |
| `drawAgentSprite` | `packages/ui/src/components/office/AgentSprite.ts` | Canvas blit pattern to reuse for player |

**Installation:**
```bash
# No new packages needed
```

---

## Architecture Patterns

### Recommended Project Structure
```
packages/ui/src/game/
├── GameEngine.ts        # (existing) rAF base class
├── GameState.ts         # (existing) player, camera, npcs, tick
├── Camera.ts            # (existing) updateCamera, lerp, clamp
├── PlayerInput.ts       # NEW — keysDown Set, attach/detach, inputEnabled flag
└── __tests__/
    ├── GameEngine.test.ts
    ├── Camera.test.ts
    ├── GameState.test.ts
    └── PlayerInput.test.ts  # NEW — pure unit tests for input logic
```

### Pattern 1: Held-Key Set (Polling Input)

**What:** Maintain a `Set<string>` of currently-held key codes. `keydown` adds, `keyup` removes. `update()` reads the set each frame.

**When to use:** Any game where multiple simultaneous keys must be tracked (WASD + diagonal), and movement is computed in the game loop rather than in event handlers.

**Why not keydown repeat events:** `keydown` fires at OS repeat rate (~30 Hz), which is not frame-rate aligned and produces uneven movement speed. Polling the Set on every rAF tick at 60 Hz with deltaMs scaling is the correct approach.

**Example:**
```typescript
// packages/ui/src/game/PlayerInput.ts

export const PLAYER_SPEED = 120  // pixels per second

const keysDown = new Set<string>()
let _attached = false

function onKeyDown(e: KeyboardEvent): void {
  // Ignore when focus is in a text field or modal input
  const active = document.activeElement
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  ) return
  keysDown.add(e.code)
  // Prevent scroll on arrow keys only when game is capturing input
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
    e.preventDefault()
  }
}

function onKeyUp(e: KeyboardEvent): void {
  keysDown.delete(e.code)
}

export function attachInput(): void {
  if (_attached) return
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  _attached = true
}

export function detachInput(): void {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  keysDown.clear()
  _attached = false
}

export function getKeysDown(): ReadonlySet<string> {
  return keysDown
}
```

### Pattern 2: movePlayer() Pure Function

**What:** A pure function that takes the current keysDown Set, the player state, deltaMs, and world bounds, mutates player in-place (matching gameState mutation pattern), and returns the new direction.

**When to use:** Called from OfficePage's `engine.update()` override, after which camera target is updated.

**Example:**
```typescript
// packages/ui/src/game/PlayerInput.ts (continued)

import { WORLD_W, WORLD_H } from './GameState.js'
import type { Direction } from '../components/office/spriteStates.js'

export function movePlayer(
  player: { x: number; y: number; direction: string },
  keys: ReadonlySet<string>,
  deltaMs: number,
): void {
  const dt = deltaMs / 1000  // seconds
  const dist = PLAYER_SPEED * dt

  const up    = keys.has('KeyW') || keys.has('ArrowUp')
  const down  = keys.has('KeyS') || keys.has('ArrowDown')
  const left  = keys.has('KeyA') || keys.has('ArrowLeft')
  const right = keys.has('KeyD') || keys.has('ArrowRight')

  let dx = 0
  let dy = 0
  if (right) dx += 1
  if (left)  dx -= 1
  if (down)  dy += 1
  if (up)    dy -= 1

  // Normalize diagonal movement (45-degree speed equals cardinal speed)
  if (dx !== 0 && dy !== 0) {
    const INV_SQRT2 = 0.7071
    dx *= INV_SQRT2
    dy *= INV_SQRT2
  }

  player.x = Math.max(0, Math.min(player.x + dx * dist, WORLD_W - 64))
  player.y = Math.max(0, Math.min(player.y + dy * dist, WORLD_H - 64))

  // Derive direction from movement vector
  const direction = deriveDirection(dx, dy)
  if (direction) player.direction = direction
  // If no keys held, keep last facing direction
}

function deriveDirection(dx: number, dy: number): Direction | null {
  if (dx === 0 && dy === 0) return null
  if (dx > 0 && dy === 0) return 'east'
  if (dx < 0 && dy === 0) return 'west'
  if (dx === 0 && dy < 0) return 'north'
  if (dx === 0 && dy > 0) return 'south'
  if (dx > 0 && dy < 0)  return 'north-east'
  if (dx > 0 && dy > 0)  return 'south-east'
  if (dx < 0 && dy < 0)  return 'north-west'
  if (dx < 0 && dy > 0)  return 'south-west'
  return null
}
```

### Pattern 3: Camera Follow in update()

**What:** After moving the player, set `gameState.camera.targetX/Y` so the lerp-based `updateCamera()` follows smoothly.

**Formula:** `targetX = player.x - viewportW / 2`, `targetY = player.y - viewportH / 2`. The existing `updateCamera()` already lerps and clamps — no changes to Camera.ts needed.

**Example:**
```typescript
// Inside OfficePage engine.update() override — after movePlayer():
const cam = gameState.camera
cam.targetX = gameState.player.x - cam.viewportW / 2
cam.targetY = gameState.player.y - cam.viewportH / 2
// updateCamera() is already called next — lerp handles smoothing
```

### Pattern 4: Click-to-Teleport (Instant Camera Jump)

**What:** When a canvas click hits an NPC sprite, instead of only opening a popup, also teleport the camera to center on that NPC. "Instant" means set both `cam.x` AND `cam.targetX` to the same value so the lerp has nothing to converge — one-frame arrival.

**Interaction with existing click handler:** The existing handler in OfficePage already iterates `gameState.npcs` and calls `selectSession()`. Phase 16 adds camera centering to that same handler. No conflict — it is additive.

**Example:**
```typescript
// Inside handleClick — after selectSession():
const cam = gameState.camera
const npc = gameState.npcs[sessionId]
cam.targetX = npc.x - cam.viewportW / 2
cam.targetY = npc.y - cam.viewportH / 2
cam.x = cam.targetX  // instant snap, not lerp
cam.y = cam.targetY
```

### Pattern 5: Player Draw Order (Z-Order)

**What:** Canvas draw order determines z-order. Draw NPCs first, then the player character on top. The player sprite uses the same `drawAgentSprite` blit pattern but with a fixed character type (e.g., `'astronaut'` or a dedicated player sprite).

**Key question resolved:** The player sprite sheet. No dedicated `player-sheet.png` exists in `/sprites/`. The player should reuse one of the existing character sheets. The simplest approach is to pick one character type as the "player" (e.g., `'astronaut'`) and use it with `DIRECTION_ROWS[player.direction]` for facing. This avoids creating new assets in Phase 16.

**Player draw in render():**
```typescript
// After drawing all NPC sprites:
const playerScreenX = gameState.player.x - gameState.camera.x
const playerScreenY = gameState.player.y - gameState.camera.y
// Reuse drawAgentSprite with a synthetic "player session" or inline the blit:
const direction = gameState.player.direction as Direction
const row = DIRECTION_ROWS[direction]
ctx.drawImage(playerImg, 0 * 64, row * 64, 64, 64, playerScreenX, playerScreenY, 64, 64)
```

### Anti-Patterns to Avoid

- **Moving player in keydown event handler:** Produces OS-repeat-rate movement (~30 Hz), not frame-aligned, uneven speed. Always poll keysDown Set inside `update()`.
- **Calling `e.preventDefault()` unconditionally on all keys:** Breaks browser shortcuts (F5, Tab). Only `preventDefault` on game-consumed keys (WASD, arrows).
- **Setting only `cam.targetX/Y` for click-to-teleport:** Camera will lerp slowly to the target (can take 60+ frames). Set both `cam.x = cam.targetX` for instant arrival.
- **Using `e.key` for key identity instead of `e.code`:** `e.key` is layout-dependent (AZERTY 'z' is not 'w'). Use `e.code` ('KeyW', 'KeyS', etc.) for physical key identity.
- **Drawing player before NPCs:** Player would appear behind NPC sprites. Draw player last.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sprite sheet row selection | Custom direction→row mapping | `DIRECTION_ROWS` from `spriteStates.ts` | Already maps all 8 directions; adding custom code diverges from the established pattern |
| Camera lerp/clamp | Custom camera math | `updateCamera()` from `Camera.ts` | Already handles lerp + world-bounds clamping; teleport is just `cam.x = cam.targetX` before `updateCamera()` runs |
| Game loop timing | Custom setInterval timing | Existing `GameEngine` rAF loop with deltaMs | Already has 100ms delta cap, stop guard, and subclass hook |
| Player bounds clamping | Custom clamp logic | `Math.max(0, Math.min(x, WORLD_W - 64))` (one-liner) | Identical to camera clamp pattern; no abstraction needed |

---

## Common Pitfalls

### Pitfall 1: Arrow Key Page Scroll
**What goes wrong:** Arrow keys scroll the page/container when the canvas has focus, interrupting gameplay.
**Why it happens:** Default browser behavior for `ArrowUp/Down/Left/Right` is scroll.
**How to avoid:** Call `e.preventDefault()` inside `onKeyDown` when the key is a game key AND the game is active. Limit to game keys only (not all keys).
**Warning signs:** Page jumps when pressing arrow keys during play.

### Pitfall 2: Input Leak into Text Fields
**What goes wrong:** Typing in a search box or modal input also moves the player character.
**Why it happens:** `window` keydown listeners fire even when a form input has focus.
**How to avoid:** At the top of `onKeyDown`, check `document.activeElement` — if it's an input/textarea/select/contenteditable, return early without adding to keysDown.
**Warning signs:** Player moves while user is typing a session name or search query.

### Pitfall 3: keysDown Not Cleared on Detach
**What goes wrong:** Player character continues moving after the page unmounts or the game engine stops, if stale keys remain in the Set.
**Why it happens:** `keyup` events are not fired when the listener is removed.
**How to avoid:** `detachInput()` calls `keysDown.clear()` before removing listeners. OfficePage cleanup calls `detachInput()` in the same useEffect cleanup as `engine.stop()`.
**Warning signs:** Character "slides" in a direction after navigation away from OfficePage.

### Pitfall 4: Double-Speed Diagonal Movement
**What goes wrong:** Diagonal movement (e.g., W+D) is faster than cardinal movement because dx=1, dy=1 produces a hypotenuse length of √2.
**Why it happens:** Adding x and y velocities without normalizing.
**How to avoid:** When both dx and dy are non-zero, multiply both by `1/√2 ≈ 0.7071` before applying.
**Warning signs:** Player visibly moves faster at 45-degree angles.

### Pitfall 5: Camera Doesn't Clamp After Teleport
**What goes wrong:** After click-to-teleport, camera is set to an out-of-bounds position.
**Why it happens:** Setting `cam.x = cam.targetX` bypasses the clamp in `updateCamera()` — but `updateCamera()` is called on the next frame anyway, so this is self-correcting on the next tick. However, if the NPC is near a world edge, it's correct to clamp `targetX` before assigning.
**How to avoid:** The safest approach is to clamp `targetX` to `[0, WORLD_W - viewportW]` before assigning. Or simply let `updateCamera()` fix it on the next frame — the one-frame glitch is imperceptible.

### Pitfall 6: Player Rendered Before NPC Sprites
**What goes wrong:** Player character appears behind NPC sprites (z-order issue).
**Why it happens:** Canvas draw order is the z-order; whoever is drawn first is underneath.
**How to avoid:** In `render()`, draw all NPCs in the Object.values loop first, then draw the player character after the loop.

---

## Code Examples

### PlayerInput.ts — Complete Module Structure
```typescript
// Source: pattern derived from Phase 15 GameEngine architecture

export const PLAYER_SPEED = 120  // px/sec — tunable

const keysDown = new Set<string>()
let _attached = false

export function attachInput(): void { ... }
export function detachInput(): void { ... }
export function getKeysDown(): ReadonlySet<string> { return keysDown }
export function movePlayer(player: ..., keys: ..., deltaMs: number): void { ... }
```

### OfficePage update() Integration
```typescript
update(deltaMs: number) {
  gameState.tick += 1
  movePlayer(gameState.player, getKeysDown(), deltaMs)
  // Update camera target to follow player
  const cam = gameState.camera
  cam.targetX = gameState.player.x - cam.viewportW / 2
  cam.targetY = gameState.player.y - cam.viewportH / 2
  updateCamera(cam, { minX: 0, minY: 0, maxX: WORLD_W, maxY: WORLD_H }, deltaMs)
}
```

### OfficePage render() Player Draw (after NPC loop)
```typescript
render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  // Draw NPCs first
  Object.values(liveSessions ?? {}).forEach((session) => { ... })
  // Draw player on top
  const px = gameState.player.x - gameState.camera.x
  const py = gameState.player.y - gameState.camera.y
  const row = DIRECTION_ROWS[gameState.player.direction as Direction]
  if (playerImg?.complete) {
    ctx.drawImage(playerImg, 0, row * 64, 64, 64, px, py, 64, 64)
  }
}
```

### Click-to-Teleport in handleClick
```typescript
function handleClick(e: MouseEvent) {
  const rect = canvas!.getBoundingClientRect()
  const clickX = e.clientX - rect.left + gameState.camera.x
  const clickY = e.clientY - rect.top + gameState.camera.y
  const SPRITE_SIZE = 64
  for (const [sessionId, pos] of Object.entries(gameState.npcs)) {
    if (clickX >= pos.x && clickX <= pos.x + SPRITE_SIZE &&
        clickY >= pos.y && clickY <= pos.y + SPRITE_SIZE) {
      // Existing: open popup
      useStore.getState().selectSession(sessionId)
      useStore.getState().setHistoryMode?.(false)
      setPopupOpen(true)
      // New (Phase 16): teleport camera to NPC
      const cam = gameState.camera
      cam.targetX = Math.max(0, Math.min(pos.x - cam.viewportW / 2, WORLD_W - cam.viewportW))
      cam.targetY = Math.max(0, Math.min(pos.y - cam.viewportH / 2, WORLD_H - cam.viewportH))
      cam.x = cam.targetX  // instant — no lerp
      cam.y = cam.targetY
      break
    }
  }
}
```

---

## Open Questions

1. **Player sprite asset**
   - What we know: No `player-sheet.png` exists. All existing character sheets are for NPCs.
   - What's unclear: Should Phase 16 pick one of the existing character types as the player, or create a new player sheet?
   - Recommendation: Use `'astronaut'` as the player character type in Phase 16. This is the simplest approach requiring no new assets. If a dedicated player sheet is needed, that is a cosmetics concern (v2 SKIN-01).

2. **Player sprite: static vs animated frame**
   - What we know: Phase 15 decision locked `col=0` (static blit) for all sprites. Phase 20 will add animation stepping.
   - What's unclear: Should player movement use animated frames in Phase 16?
   - Recommendation: No — keep `col=0` (static blit). Consistent with Phase 15-03 decision. Animation is Phase 20.

3. **Player starting position**
   - What we know: `gameState.player` initializes to `{ x: 192, y: 480 }` (2×96, 5×96).
   - What's unclear: Is this a good default? NPCs start at `{0,0}` grid layout.
   - Recommendation: The current initial position is fine for Phase 16. No change needed.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (jsdom environment) |
| Config file | `packages/ui/vitest.config.ts` |
| Quick run command | `npx vitest run packages/ui/src/game/__tests__/PlayerInput.test.ts` |
| Full suite command | `npx vitest run --project packages/ui` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| player-movement | `movePlayer()` moves x/y by speed*dt | unit | `npx vitest run packages/ui/src/game/__tests__/PlayerInput.test.ts` | ❌ Wave 0 |
| player-movement | diagonal movement is normalized (not √2 faster) | unit | same | ❌ Wave 0 |
| player-movement | player cannot move outside world bounds | unit | same | ❌ Wave 0 |
| player-movement | direction updates correctly for each key combo | unit | same | ❌ Wave 0 |
| player-movement | direction does not change when no keys held | unit | same | ❌ Wave 0 |
| input-tracking | `onKeyDown` is a no-op when an input element is focused | unit | same | ❌ Wave 0 |
| input-tracking | `attachInput` / `detachInput` add and remove listeners | unit | same | ❌ Wave 0 |
| input-tracking | `keysDown` is cleared on `detachInput` | unit | same | ❌ Wave 0 |
| click-to-teleport | canvas click on NPC sets cam.x/y = targetX/Y (instant) | unit (OfficePage test) | `npx vitest run packages/ui/src/pages/__tests__/OfficePage.test.tsx` | ✅ exists (needs new test case) |

### Sampling Rate
- **Per task commit:** `npx vitest run packages/ui/src/game/__tests__/PlayerInput.test.ts`
- **Per wave merge:** `npx vitest run` (from `packages/ui/`)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/ui/src/game/__tests__/PlayerInput.test.ts` — covers player-movement and input-tracking
- [ ] `packages/ui/src/game/PlayerInput.ts` — the module under test (must be created before tests can be written)

*(Existing test infrastructure — Vitest, jsdom, setupTests.ts — covers all framework needs. No new framework install required.)*

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `GameEngine.ts`, `GameState.ts`, `Camera.ts`, `OfficePage.tsx`, `AgentSprite.tsx`, `spriteStates.ts` — all read and cross-referenced
- Phase 15 SUMMARY files (15-01, 15-02, 15-03) — confirmed decisions, patterns, and deferred work
- `packages/ui/public/sprites/alien-manifest.json` — confirmed 8-direction, 64px frame sprite sheet structure

### Secondary (MEDIUM confidence)
- Browser KeyboardEvent API: `e.code` vs `e.key` distinction is well-established browser behavior; `e.code` is physical key, layout-independent
- `document.activeElement` focus check for input conflict prevention: standard browser pattern, no library needed

### Tertiary (LOW confidence)
- PLAYER_SPEED = 120 px/sec: a reasonable starting value for a 1920×1440 world at 64px tiles, but may need tuning after playtesting

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — confirmed from codebase; no new deps needed
- Architecture: HIGH — patterns follow existing Phase 15 conventions exactly
- Pitfalls: HIGH — derived from codebase inspection + well-known browser input patterns
- Player sprite: MEDIUM — no dedicated player asset exists; reuse recommendation is pragmatic but not formally spec'd

**Research date:** 2026-04-10
**Valid until:** 2026-06-10 (stable — no fast-moving dependencies)
