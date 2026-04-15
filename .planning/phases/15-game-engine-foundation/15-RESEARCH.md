# Phase 15: Game Engine Foundation - Research

**Researched:** 2026-04-10
**Domain:** Browser game engine patterns, requestAnimationFrame loop, Canvas 2D API, plain-object state stores
**Confidence:** HIGH

---

## Summary

Phase 15 introduces a game engine layer on top of the existing React/Zustand application. The approach is a hybrid: a Canvas element for game rendering sits behind the React overlay (sidebar, popups, top bar). A `GameEngine` class drives a `requestAnimationFrame` loop and owns a plain `GameState` object that is mutated every frame without touching React or Zustand, keeping 60 FPS achievable. A `Camera` system uses linear interpolation (lerp) to follow a target position and clamps to world bounds.

The critical architectural constraint is isolation: the game loop must never cause React re-renders. This means `GameState` is a mutable plain object, not Zustand state. Only events that cross the boundary (e.g. a popup opening) should flow into Zustand. The Canvas sits in the same DOM parent as the React UI but is positioned with `z-index` behind it.

Phase 15 is pure infrastructure — it does not yet move any sprites to Canvas (Plan 15-03 wires sprites in). Plans 15-01 and 15-02 are the foundation: `GameEngine` class, `GameState` types, Canvas mount, and Camera system.

**Primary recommendation:** Implement `GameEngine` as a plain TypeScript class (no framework), mount a `<canvas>` in `OfficePage` via a React `useRef`/`useEffect`, and keep `GameState` as a module-level mutable object that the game loop mutates directly.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| game-loop | `requestAnimationFrame` loop at 60 FPS; delta time passed to all update functions | rAF loop pattern, delta time calculation, pause/resume |
| gamestate-store | `GameState` object updated every frame without triggering React re-renders | Plain mutable object pattern; ref-based store; never call Zustand `set` in game loop |
| camera-system | Camera lerps toward target position and stops at world bounds | Lerp formula, bounds clamping, world size constants |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none) | — | Game loop | `requestAnimationFrame` is native browser API; no library needed |
| (none) | — | Canvas 2D rendering | `HTMLCanvasElement.getContext('2d')` is native; no library needed |
| TypeScript | 5.x (already in project) | Type-safe GameState and Camera types | Already in project |
| Zustand | 5.0.11 (already in project) | React UI state only — NOT used for game state | Already in project |
| Vitest + jsdom | 3.x (already in project) | Unit testing game logic | Already in project |

### Supporting

No new libraries are needed for Phase 15. The entire game engine is native browser APIs wrapped in plain TypeScript classes.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain rAF loop | Phaser.js / Pixi.js | Too heavy; we own a hybrid React+Canvas app; these frameworks want to own the DOM |
| Plain rAF loop | Three.js | Overkill for 2D pixel art; no 3D needed |
| Plain mutable object | Zustand for game state | Zustand triggers React re-renders on every `set`; unacceptable at 60 FPS |
| Plain mutable object | Valtio / Jotai atoms | Same re-render problem; game state is write-heavy every frame |
| Canvas behind React | React overlay on Three.js / Pixi scene | This project is already React-first; Canvas-behind approach is simpler |

**Installation:**

No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

```
packages/ui/src/
├── game/
│   ├── GameEngine.ts        # rAF loop, pause/resume, deltaTime
│   ├── GameState.ts         # Plain mutable GameState type + singleton
│   ├── Camera.ts            # Lerp, bounds clamping, follow logic
│   └── __tests__/
│       ├── GameEngine.test.ts
│       ├── GameState.test.ts
│       └── Camera.test.ts
└── pages/
    └── OfficePage.tsx       # Canvas mount via useRef + GameEngine lifecycle
```

### Pattern 1: requestAnimationFrame Loop with Delta Time

**What:** A class-owned rAF loop that computes delta time between frames and passes it to all update functions. Capped at a maximum delta (e.g. 100ms) to prevent spiral-of-death after tab becomes visible again.

**When to use:** Always — delta time is required for frame-rate-independent movement.

```typescript
// packages/ui/src/game/GameEngine.ts
export class GameEngine {
  private rafId: number | null = null
  private lastTimestamp: number | null = null
  private readonly MAX_DELTA_MS = 100

  start(): void {
    if (this.rafId !== null) return
    this.rafId = requestAnimationFrame(this._loop)
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.lastTimestamp = null
  }

  private _loop = (timestamp: number): void => {
    const raw = this.lastTimestamp !== null ? timestamp - this.lastTimestamp : 0
    const deltaMs = Math.min(raw, this.MAX_DELTA_MS)
    this.lastTimestamp = timestamp

    this.update(deltaMs)
    this.render()

    this.rafId = requestAnimationFrame(this._loop)
  }

  update(_deltaMs: number): void { /* override or inject */ }
  render(): void { /* override or inject */ }
}
```

### Pattern 2: Mutable GameState Singleton (No React)

**What:** `GameState` is a plain mutable TypeScript object, updated in-place every frame. It is never passed to Zustand `set()`. React reads from it only on specific events (e.g. a popup open) via a bridge function.

**When to use:** All game-tick state: player position, camera position, NPC positions, animation frames, particle state.

```typescript
// packages/ui/src/game/GameState.ts
export interface GameState {
  camera: { x: number; y: number; targetX: number; targetY: number }
  player: { x: number; y: number; direction: string }
  npcs: Record<string, { x: number; y: number }>
  tick: number
}

export const gameState: GameState = {
  camera: { x: 0, y: 0, targetX: 0, targetY: 0 },
  player: { x: 2 * 96, y: 5 * 96, direction: 'south' },
  npcs: {},
  tick: 0,
}
```

**Key insight:** The singleton is mutated directly (`gameState.camera.x = ...`), never via React state setters. This is why it cannot trigger re-renders.

### Pattern 3: Canvas Mount in React via useRef

**What:** Mount a `<canvas>` element with a React `ref`. The game engine is instantiated in a `useEffect` with a cleanup function that calls `engine.stop()` and destroys the canvas context reference.

**When to use:** Whenever a Canvas needs to coexist with a React component tree.

```typescript
// In OfficePage.tsx
import { useRef, useEffect } from 'react'
import { GameEngine } from '../game/GameEngine.js'

export function OfficePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new GameEngine(canvas)
    engine.start()
    return () => engine.stop()
  }, [])

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Canvas sits BEHIND React overlay */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, zIndex: 0 }}
        data-testid="game-canvas"
      />
      {/* React overlay sits ON TOP */}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
        {/* existing React content: sprites as CSS divs, popups, etc. */}
      </div>
    </div>
  )
}
```

### Pattern 4: Camera Lerp with World Bounds Clamping

**What:** Linear interpolation moves camera toward target by a fixed fraction each frame. Clamping prevents the camera viewport from showing outside the world rectangle.

**When to use:** Any camera follow system that should feel smooth, not snappy.

```typescript
// packages/ui/src/game/Camera.ts
export interface WorldBounds {
  minX: number; minY: number
  maxX: number; maxY: number
}

export interface CameraState {
  x: number; y: number
  targetX: number; targetY: number
  viewportW: number; viewportH: number
}

const LERP_FACTOR = 0.1  // fraction per frame — tune for feel

export function updateCamera(
  cam: CameraState,
  bounds: WorldBounds,
  _deltaMs: number,
): void {
  // Lerp toward target
  cam.x += (cam.targetX - cam.x) * LERP_FACTOR
  cam.y += (cam.targetY - cam.y) * LERP_FACTOR

  // Clamp so viewport doesn't exceed world edges
  cam.x = Math.max(bounds.minX, Math.min(cam.x, bounds.maxX - cam.viewportW))
  cam.y = Math.max(bounds.minY, Math.min(cam.y, bounds.maxY - cam.viewportH))
}
```

**Note on lerp factor and delta time:** For perfectly frame-rate-independent lerp, use `1 - Math.pow(1 - factor, deltaMs / 16.67)`. For a 60-FPS-targeted game at a known frame rate this simplification is sufficient for Phase 15. Upgrade to exponential lerp if frame rate independence is a hard requirement.

### Pattern 5: Canvas Resize Observer

**What:** Canvas dimensions must exactly match the viewport pixel size or images will appear blurry/scaled. Use a `ResizeObserver` to update canvas width/height whenever the container resizes.

**When to use:** Always on Canvas mount.

```typescript
useEffect(() => {
  const canvas = canvasRef.current
  if (!canvas) return
  const observer = new ResizeObserver(([entry]) => {
    canvas.width = entry.contentRect.width
    canvas.height = entry.contentRect.height
  })
  observer.observe(canvas.parentElement!)
  return () => observer.disconnect()
}, [])
```

### Anti-Patterns to Avoid

- **Calling Zustand `set()` inside the game loop:** Zustand notifies all subscribers synchronously. At 60 FPS this triggers 60 React render cycles per second and will degrade the UI to a slideshow.
- **Using React `useState` for camera or player position:** Same re-render problem. Use `useRef` or the mutable `gameState` singleton instead.
- **Starting the rAF loop outside a `useEffect`:** The loop fires immediately on module import, starts even before the canvas mounts, and leaks on hot reload. Always start in `useEffect`.
- **Not capping delta time:** If the browser pauses (tab hidden, debugger), the next frame's delta could be many seconds. Without a cap, entities teleport.
- **Setting `canvas.width`/`canvas.height` in CSS only:** CSS sizing scales a fixed-resolution canvas (blurry). Always set the DOM attributes, not just CSS.
- **Not calling `cancelAnimationFrame` in cleanup:** Causes a ghost loop after the component unmounts (React Strict Mode will expose this immediately).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Frame timing | Custom `setInterval(fn, 1000/60)` | `requestAnimationFrame` | rAF is synced to display refresh, pauses when tab is hidden, avoids drift |
| Canvas resize | Manual `window.resize` listener | `ResizeObserver` on container | `ResizeObserver` fires on element resize (flex/CSS changes), not just window resize |
| Lerp math | Bespoke spring/tween library | Inline `x += (target - x) * factor` | One-liner; no library justified at this scale |

**Key insight:** A game loop at this scale needs no framework. Phaser/Pixi solve multiplayer networking, physics, asset loading pipelines, and audio graphs. We need a 60 FPS rAF tick and a lerping camera — that is 80 lines of TypeScript.

---

## Common Pitfalls

### Pitfall 1: React Strict Mode Double-Mount

**What goes wrong:** In React 18 Strict Mode (development), effects run twice (mount → unmount → mount). If `GameEngine.start()` doesn't guard against double-start, two rAF loops run simultaneously, doubling frame rate and causing visible tearing.

**Why it happens:** Strict Mode deliberately double-invokes effects to surface missing cleanups.

**How to avoid:** Guard `start()` with `if (this.rafId !== null) return`. Always return a cleanup from `useEffect` that calls `engine.stop()`.

**Warning signs:** Frame rate counter shows 120+ FPS in development. Canvas flickers.

### Pitfall 2: Canvas Layer Ordering vs React Portals

**What goes wrong:** Radix Dialog (used by `InstancePopupHub`) renders via a React Portal to `document.body`. If the Canvas has `z-index` higher than the dialog backdrop, popups render behind the canvas.

**Why it happens:** Portal content renders outside the normal component tree. `z-index` is compared within the same stacking context.

**How to avoid:** Keep Canvas at `z-index: 0`. The React overlay wrapper gets `z-index: 1`. Radix portals default to a very high z-index (they render in a Radix-specific portal div). Verify by rendering a popup in dev and inspecting computed z-index.

**Warning signs:** Clicking an agent sprite opens a popup but it appears behind the canvas.

### Pitfall 3: gameState Mutation Timing vs React Reads

**What goes wrong:** A React component reads from `gameState` synchronously during render. Because `gameState` is a mutable object, it might be mid-mutation when the render executes (e.g., camera half-lerped).

**Why it happens:** React renders and the rAF callback can interleave in the event loop.

**How to avoid:** Phase 15 keeps React components reading Zustand state, not `gameState`. The `gameState` object is consumed only inside the rAF loop (for canvas drawing). Bridging happens through explicit Zustand writes on discrete events, not continuous polling.

**Warning signs:** React UI shows stale or impossible values (e.g., camera coordinates mid-lerp).

### Pitfall 4: Canvas Context Lost

**What goes wrong:** `canvas.getContext('2d')` returns `null` if called before the canvas is in the DOM, or if WebGL context limit is hit on some mobile browsers.

**Why it happens:** `getContext` requires the element to be rendered.

**How to avoid:** Get the context inside the `useEffect` after canvas mounts. Guard with `if (!canvas || !ctx) return`. Log a console error if null.

**Warning signs:** Nothing renders on canvas; no JS errors thrown (silent failure).

### Pitfall 5: OfficePage Already Has `data-testid="office-canvas"` on a `<div>`

**What goes wrong:** The current `OfficePage` uses `data-testid="office-canvas"` on the container `<div>`. When the Canvas `<canvas>` is added, the existing OfficePage test asserts on this testid. The testid naming collision creates confusion.

**Why it happens:** `data-testid="office-canvas"` was chosen before the actual canvas element existed.

**How to avoid:** In Plan 15-02, keep `data-testid="office-canvas"` on the container `<div>` (for existing tests). Give the new `<canvas>` element `data-testid="game-canvas"`. Update `OfficePage.test.tsx` accordingly.

---

## Code Examples

Verified patterns from native browser APIs and TypeScript:

### requestAnimationFrame with delta time cap

```typescript
// Source: MDN Web Docs — Window.requestAnimationFrame()
private _loop = (timestamp: number): void => {
  const rawDelta = this.lastTimestamp !== null ? timestamp - this.lastTimestamp : 0
  const deltaMs = Math.min(rawDelta, this.MAX_DELTA_MS)
  this.lastTimestamp = timestamp
  this.update(deltaMs)
  this.render()
  this.rafId = requestAnimationFrame(this._loop)
}
```

### Lerp (linear interpolation)

```typescript
// Standard game math — no library reference needed
function lerp(current: number, target: number, t: number): number {
  return current + (target - current) * t
}
```

### Canvas sizing to match container

```typescript
// Source: MDN — ResizeObserver
const observer = new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect
  canvas.width = Math.round(width)
  canvas.height = Math.round(height)
})
observer.observe(container)
```

### Cancel on cleanup (prevents Strict Mode ghost loops)

```typescript
useEffect(() => {
  const engine = new GameEngine(canvasRef.current!)
  engine.start()
  return () => engine.stop()   // always cancel on unmount
}, [])
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `setInterval` for game loops | `requestAnimationFrame` | 2011 (spec stable) | Syncs to display refresh, pauses when hidden, no drift |
| `canvas.style.width/height` only | Set `canvas.width`/`canvas.height` attributes | Always correct | Avoids blurry scaled canvas |
| Spring libraries for camera | Inline lerp `x += (t-x)*k` | N/A | Simpler, faster, no deps |
| React state for game world | Mutable object + rAF | Game-engine pattern | Eliminates re-render overhead at 60 FPS |

**Deprecated/outdated:**
- `window.requestAnimationFrame` polyfills: Not needed; all target browsers support rAF natively.
- `webkitRequestAnimationFrame`: Prefix dropped; use `requestAnimationFrame` directly.

---

## Open Questions

1. **World size (map dimensions)**
   - What we know: Grid cells are 96px, current map is effectively unbounded (agents are placed in a scrolling div).
   - What's unclear: What are the definitive world width × height in pixels for Phase 15? Camera bounds clamping requires these constants.
   - Recommendation: Define `WORLD_W = 96 * 20` and `WORLD_H = 96 * 15` as initial constants in `GameState.ts`. Make them easy to change in later phases when map design is settled.

2. **Canvas rendering in Plan 15-03: what exactly gets drawn?**
   - What we know: Phase 15-03 wires sprite rendering into Canvas (replacing CSS-positioned divs). But the sprite sheet is a PNG and CSS class animations are currently used.
   - What's unclear: Does 15-03 reproduce full animation logic (frame stepping) in Canvas? Or just static sprites for now?
   - Recommendation: Scope 15-03 to static sprite blit (no animation state machine) to keep the plan achievable. Animation can stay CSS-driven or be ported in Phase 16.

3. **Interaction between DnD kit and Canvas layer**
   - What we know: `@dnd-kit/core` uses pointer events on DOM elements. After 15-03 moves sprites to Canvas, drag-and-drop will no longer have DOM elements to attach to.
   - What's unclear: Plan 15-03 removes CSS-positioned sprites. Does drag-and-drop get removed in 15-03, or is it suspended?
   - Recommendation: In Phase 15-03, remove drag-and-drop from OfficePage. Positions in Phase 15+ are driven by `GameState` (NPC zones), not user drag. Document this as a breaking change.

---

## Validation Architecture

Nyquist validation is enabled (`nyquist_validation: true` in config.json).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x + jsdom |
| Config file | `packages/ui/vitest.config.ts` |
| Quick run command | `cd packages/ui && npx vitest run src/game/` |
| Full suite command | `cd packages/ui && npx vitest run` |

### Success Criteria → Test Map

| Success Criterion | Behavior | Test Type | Automated Command | Notes |
|-------------------|----------|-----------|-------------------|-------|
| SC-1: rAF loop at 60 FPS; delta time passed to update functions | `GameEngine.start()` calls rAF; `update(deltaMs)` receives correct delta | Unit | `npx vitest run src/game/__tests__/GameEngine.test.ts` | Mock `requestAnimationFrame` and `Date.now`; verify delta capped at 100ms |
| SC-1: Loop pauses on `stop()` | `cancelAnimationFrame` called; no further `update()` invocations | Unit | Same file | Assert `rafId` cleared, update not called after stop |
| SC-2: GameState mutated without React re-renders | `gameState.tick` increments each frame; no Zustand `set` called | Unit | `npx vitest run src/game/__tests__/GameState.test.ts` | Spy on Zustand store; assert `set` never called during loop |
| SC-3: Canvas mounted, sized to viewport | `<canvas>` element present in DOM with correct width/height | Integration (RTL) | `npx vitest run src/pages/__tests__/OfficePage.test.tsx` | Use ResizeObserver mock; assert `canvas.width === container.clientWidth` |
| SC-3: Canvas z-index behind React overlay | Canvas has lower stacking order than React content | Manual | Visual inspection in browser dev tools | Check computed z-index and stacking context |
| SC-4: Camera lerps toward target | After N frames, camera.x moves toward targetX | Unit | `npx vitest run src/game/__tests__/Camera.test.ts` | Call `updateCamera` N times; assert convergence without overshoot |
| SC-4: Camera clamps at world bounds | camera.x never goes below `minX` or above `maxX - viewportW` | Unit | Same file | Set targetX to extreme values; assert clamped result |
| SC-5: React UI renders on top of Canvas | Sidebar, popup, top bar visible and interactive after Canvas mount | Manual + RTL | OfficePage test: assert sidebar and popup elements present after mount | Popup z-index tested separately via Radix Dialog; RTL renders full OfficePage |

### Phase-Specific Test Scenarios

**GameEngine unit tests (Wave 0 gap — file does not exist yet):**
- `start()` registers a rAF callback
- `stop()` cancels the rAF and resets `lastTimestamp`
- Delta time is `timestamp - lastTimestamp` for the first frame after start
- Delta time is capped at `MAX_DELTA_MS` when gap is large
- `start()` called twice does not create two loops (guard check)
- `update(deltaMs)` is called with the computed deltaMs on each tick

**GameState unit tests (Wave 0 gap — file does not exist yet):**
- Singleton `gameState` has correct initial values for camera, player, tick
- Mutating `gameState.camera.x` does not trigger any Zustand subscriber
- `tick` increments correctly when the engine calls `update`

**Camera unit tests (Wave 0 gap — file does not exist yet):**
- `updateCamera` moves camera.x toward targetX by `LERP_FACTOR` fraction
- After many frames, camera converges to within 1px of target
- camera.x is clamped to `bounds.minX` when target is far left
- camera.x is clamped to `bounds.maxX - viewportW` when target is far right
- Same for Y axis

**OfficePage integration test (extends existing `OfficePage.test.tsx`):**
- Canvas element with `data-testid="game-canvas"` is present in the DOM
- Canvas is inside the `data-testid="office-canvas"` container
- `GameEngine.start()` is called on mount (mock GameEngine)
- `GameEngine.stop()` is called on unmount (cleanup verification)

### Sampling Rate

- **Per task commit:** `cd packages/ui && npx vitest run src/game/`
- **Per wave merge:** `cd packages/ui && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/game/__tests__/GameEngine.test.ts` — covers SC-1 (loop, delta, pause/resume)
- [ ] `src/game/__tests__/GameState.test.ts` — covers SC-2 (no React re-renders)
- [ ] `src/game/__tests__/Camera.test.ts` — covers SC-4 (lerp, bounds)
- [ ] `src/game/GameEngine.ts` — implementation target for Plan 15-01
- [ ] `src/game/GameState.ts` — implementation target for Plan 15-01
- [ ] `src/game/Camera.ts` — implementation target for Plan 15-02

Existing test infrastructure (Vitest + jsdom + RTL) covers all automated scenarios. No new test framework needed.

---

## Sources

### Primary (HIGH confidence)

- MDN Web Docs — `Window.requestAnimationFrame()`: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- MDN Web Docs — `ResizeObserver`: https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver
- MDN Web Docs — `HTMLCanvasElement`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement
- Zustand v5 source (packages/ui/package.json confirms `zustand@^5.0.11`) — subscribeWithSelector middleware used in existing store
- Vitest config — `packages/ui/vitest.config.ts` (read directly)
- Existing codebase — `OfficePage.tsx`, `AgentSprite.tsx`, store/index.ts (read directly)

### Secondary (MEDIUM confidence)

- Game loop delta-time capping pattern: widely documented in browser game dev resources (HTML5 Game Devs forum, MDN game tutorials). Consistent with MDN's own examples.
- Lerp camera pattern: standard in 2D game tutorials (GDC talks, libGDX docs, Phaser docs). Core math is authoritative.

### Tertiary (LOW confidence)

- None — all critical claims are grounded in MDN or direct code inspection.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; native browser APIs verified via MDN
- Architecture: HIGH — patterns derived from direct codebase inspection + well-established browser game dev patterns
- Pitfalls: HIGH — React Strict Mode double-mount, z-index/portal issue, canvas sizing are all verified common failure modes
- Test scenarios: HIGH — derived from success criteria and existing test infrastructure (read directly)

**Research date:** 2026-04-10
**Valid until:** 2026-10-10 (stable APIs; only at risk if React changes effect semantics, which would be a major version)
