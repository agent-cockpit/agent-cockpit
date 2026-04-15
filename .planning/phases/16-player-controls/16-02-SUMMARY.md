---
phase: 16-player-controls
plan: "02"
subsystem: ui
tags: [canvas, game-engine, camera, click-to-teleport, player, sprite, WASD]

requires:
  - phase: 16-01
    provides: PlayerInput.ts with movePlayer(), attachInput(), detachInput(), getKeysDown()

provides:
  - Click-to-teleport: canvas NPC click teleports player AND camera to NPC position instantly (no lerp)
  - Player sprite rendered on canvas above NPC sprites using direction-aware DIRECTION_ROWS row selection

affects: [17-npc-behavior, 20-animation]

tech-stack:
  added: []
  patterns:
    - "Click teleport moves player.x/y as well as cam.x/y — update() must keep camera consistent with player position"
    - "NPC click handler sets gameState.player position first, then computes clamped cam.targetX = player.x - vw/2"
    - "Player sprite drawn after NPC loop in render() for correct z-order (player on top)"

key-files:
  created: []
  modified:
    - packages/ui/src/pages/OfficePage.tsx
    - packages/ui/src/pages/__tests__/OfficePage.test.tsx

key-decisions:
  - "Teleport moves gameState.player.x/y to NPC position so update()'s cam.targetX = player.x - vw/2 stays consistent — without this, update() overwrites the camera teleport on the next tick"
  - "Test places NPC in gameState.npcs AFTER render() to avoid the seeding cleanup effect deleting it (cleanup removes NPCs not in useActiveSessions)"

patterns-established:
  - "Player position is the authoritative source of camera target — always move player when teleporting"

requirements-completed:
  - click-to-teleport
  - player-movement

duration: 45min
completed: 2026-04-11
---

# Phase 16 Plan 02: Click-to-Teleport and Player Sprite Summary

**NPC click teleports the player and camera to the agent's world position instantly, and draws the player astronaut sprite above NPCs using direction-aware row selection**

## Performance

- **Duration:** ~45 min (including bug investigation and fix)
- **Started:** 2026-04-11T09:00:00Z
- **Completed:** 2026-04-11T10:45:00Z
- **Tasks:** 3 (2 original + 1 bug fix)
- **Files modified:** 2

## Accomplishments
- Camera teleport to clicked NPC works correctly — snap is instant (cam.x === cam.targetX)
- Player sprite drawn on canvas at correct world-to-screen position using DIRECTION_ROWS for facing direction
- Root cause of click-teleport failure identified and fixed: `update()` was overwriting `cam.targetX/Y` with player position each tick, reverting the teleport — fix moves `gameState.player.x/y` to the NPC position on click so the camera target stays consistent across frames

## Task Commits

1. **Task 1: Add camera teleport to handleClick and extend OfficePage tests** - `3f82dcf` (feat)
2. **Task 2: Draw player sprite on canvas after NPC loop in render()** - `5de000c` (feat)
3. **Fix: Correct click-to-teleport camera snap** - `5c16b46` (fix)

## Files Created/Modified
- `packages/ui/src/pages/OfficePage.tsx` - handleClick now sets gameState.player.x/y to NPC position before setting cam.targetX/Y; render() draws player sprite after NPC loop
- `packages/ui/src/pages/__tests__/OfficePage.test.tsx` - Teleport test updated: NPC set post-render, player position assertions added, player reset in beforeEach

## Decisions Made
- **Player must teleport with camera:** `update()` runs every frame and sets `cam.targetX = player.x - vw/2`. If only the camera is moved and not the player, `update()` immediately reverts the camera to follow the player's unchanged position. The correct fix is to move the player to the NPC location so the camera's player-follow logic aligns with the teleport destination.
- **Test timing for NPC seeding:** The NPC seeding `useEffect` cleans up NPCs not present in `useActiveSessions`. Since `useActiveSessions` returns `[]` in the teleport test, any NPC placed before `render()` gets deleted. Setting the NPC after `render()` (after effects run) correctly bypasses this cleanup.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Camera teleport immediately reversed by update() on next frame**
- **Found during:** Human verification (Check 6: click-to-teleport)
- **Issue:** `handleClick` set `cam.targetX/Y` and `cam.x/Y` to snap to NPC, but `update()` unconditionally overwrites `cam.targetX = gameState.player.x - cam.viewportW / 2` each tick, resetting the camera target to follow the (unmoved) player
- **Fix:** Also set `gameState.player.x = pos.x` and `gameState.player.y = pos.y` in the click handler before computing cam targets, so `update()`'s player-follow keeps the camera centred on the teleport destination
- **Files modified:** `packages/ui/src/pages/OfficePage.tsx`, `packages/ui/src/pages/__tests__/OfficePage.test.tsx`
- **Verification:** All 9 OfficePage tests pass including teleport assertions; `cam.x === cam.targetX` after click confirmed
- **Committed in:** `5c16b46` (fix commit)

**2. [Rule 1 - Bug] Teleport test: NPC deleted by seeding cleanup before click**
- **Found during:** Task 1 fix (teleport test initially set NPC before render)
- **Issue:** `useActiveSessions` returns `[]` in the test, so the seeding `useEffect` cleanup loop deleted `teleport-session` NPC on mount, causing hit-test to find nothing and player.x to stay at 192
- **Fix:** Move `gameState.npcs['teleport-session'] = { x: 400, y: 300 }` to after `render()` call; add `gameState.player` reset in `beforeEach`
- **Files modified:** `packages/ui/src/pages/__tests__/OfficePage.test.tsx`
- **Committed in:** `5c16b46` (same fix commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both fixes essential for correctness — the camera snap is the core of the click-to-teleport requirement. No scope creep.

## Issues Encountered
- Human verification revealed click-to-teleport (Check 6) failing silently — camera did not snap on NPC click. Root cause was an architectural misunderstanding: the camera-follow system in `update()` takes precedence over one-time teleport assignments unless the player position is also moved.

## Next Phase Readiness
- Click-to-teleport: fully working — camera snap and popup open on NPC click
- Player sprite: visible on canvas, direction-aware, drawn above NPCs
- Phase 17 (NPC behavior/zones) can rely on `gameState.npcs` as source of truth for NPC positions
- Phase 20 (animation) can add frame-stepping to the existing `col=0` static blit in render()

---
*Phase: 16-player-controls*
*Completed: 2026-04-11*
