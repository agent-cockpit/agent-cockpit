---
plan: "02"
phase: 13-pixel-art-generation-and-integration
status: completed
wave: 3
completed: 2026-04-10
---

# Plan 13-02 Summary — AgentSprite Multi-Character Integration

## What Was Built

### `spriteStates.ts` — 5 new exports added
- `Direction` type (8 direction literals)
- `AnimationState` type (`'idle'|'blocked'|'completed'|'failed'`)
- `DIRECTION_ROWS: Record<Direction, number>` — south=0 … north-west=7
- `STATE_ROW_OFFSET: Record<AnimationState, number>` — idle=0, blocked=8, completed=16, failed=24
- `COLOR_STATE_TO_ANIMATION: Record<AgentAnimState, AnimationState>` — maps 8 UI states → 4 animation states

### `AgentSprite.tsx` — fully updated
- Renders at **64×64px** (was 32×32)
- `backgroundImage` uses `sessionToCharacter(session.sessionId)` → `/sprites/{char}-sheet.png`
- `direction?: Direction` prop (defaults to `'south'`)
- `useEffect` fetches `/{characterType}-manifest.json` on mount → stores per-state frame counts
- Animation loop: `setInterval` at 150ms cycles `frameIndex` when `frameCount > 1`
- `spriteRow = STATE_ROW_OFFSET[animState] + DIRECTION_ROWS[direction]`
- `backgroundPositionX`/`Y` driven by `frameIndex` and `spriteRow`
- `imageRendering: 'pixelated'`

### Tests — 67 passing
- `spriteStates.test.ts`: added DIRECTION_ROWS (9), STATE_ROW_OFFSET (4), COLOR_STATE_TO_ANIMATION (8) constant assertions
- `AgentSprite.test.tsx`: added 8 new tests for 64px size, character sheet URL, imageRendering, backgroundPositionY for planning/blocked/completed, default direction

## Verification

```
pnpm --filter @cockpit/ui test --run spriteStates characterMapping AgentSprite
# 67/67 tests pass
```

Pre-existing typecheck failure in `@cockpit/shared` (missing `zod`) is unrelated.
