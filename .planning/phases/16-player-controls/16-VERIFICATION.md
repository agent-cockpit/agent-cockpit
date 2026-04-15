---
phase: 16-player-controls
verified: 2026-04-11T11:00:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
human_verification:
  - test: "WASD/arrow key movement in browser"
    expected: "Player sprite (astronaut) moves smoothly in the correct direction at consistent speed; diagonal speed feels the same as cardinal speed; player cannot walk off world edges"
    why_human: "Frame-rate-independent smoothness, visual speed feel, and bounds edge behaviour require live rendering to assess"
  - test: "Click-to-teleport in browser"
    expected: "Clicking an NPC sprite snaps the camera instantly to centre on it AND opens the popup"
    why_human: "Instant vs lerped snap feel, and popup opening, require live browser interaction"
  - test: "Input isolation — WASD while popup/text-input is open"
    expected: "Player does NOT move while a text input or modal has focus; arrow keys do NOT scroll the page on the Office view"
    why_human: "Focus-state and scroll-prevention require manual interaction in the browser"
---

# Phase 16: Player Controls Verification Report

**Phase Goal:** Implement player controls — WASD/arrow key movement with smooth frame-rate-independent motion, diagonal normalisation, world-bounds clamping, direction tracking, plus click-to-teleport camera centering and direction-aware player sprite rendering on the canvas.
**Verified:** 2026-04-11T11:00:00Z
**Status:** passed (automated checks all green; human verification required for live feel)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | WASD and arrow keys move the player at frame-rate-independent speed | VERIFIED | `movePlayer()` uses `dt = deltaMs/1000`; 8 basic movement tests pass |
| 2 | Diagonal movement is not faster than cardinal movement (normalised) | VERIFIED | `INV_SQRT2 = 0.7071` applied when `dx !== 0 && dy !== 0`; 3 diagonal normalisation tests pass |
| 3 | Player position is clamped to world bounds (0..WORLD_W-64, 0..WORLD_H-64) | VERIFIED | `Math.max(0, Math.min(..., WORLD_W-64))` in `movePlayer()`; 4 bounds tests pass |
| 4 | Player direction updates to last movement vector; unchanged when stationary | VERIFIED | `deriveDirection()` returns null for zero vector; direction preserved when no keys; 9 direction tests pass |
| 5 | Key events ignored when input/textarea/select/contenteditable is focused | VERIFIED | `onKeyDown` early-returns for all four element types; 3 guard tests pass |
| 6 | keysDown Set is cleared when detachInput() is called | VERIFIED | `keysDown.clear()` in `detachInput()`; lifecycle test passes |
| 7 | Camera target follows player position every frame | VERIFIED | `cam.targetX = gameState.player.x - cam.viewportW / 2` in `engine.update()` in OfficePage.tsx line 68–69 |
| 8 | Clicking an NPC sprite instantly centres camera on that NPC | VERIFIED | `cam.x = cam.targetX` set in handleClick; teleport test passes (`cam.x === cam.targetX`) |
| 9 | Camera position after teleport is clamped to world bounds | VERIFIED | `Math.max(0, Math.min(pos.x - vw/2, WORLD_W - vw))` in handleClick lines 144–145 |
| 10 | The popup still opens on agent click (existing behaviour preserved) | VERIFIED | `selectSession` and `setPopupOpen(true)` still called; existing click test passes (9/9 OfficePage tests green) |
| 11 | Player sprite drawn on canvas on top of NPC sprites, using DIRECTION_ROWS row | VERIFIED | `ctx.drawImage(pImg, 0, row * 64, 64, 64, ...)` after NPC `forEach` in render(); `DIRECTION_ROWS[player.direction as Direction]` used for row |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/ui/src/game/PlayerInput.ts` | PLAYER_SPEED, attachInput, detachInput, getKeysDown, movePlayer exports | VERIFIED | 96-line file; all 5 exports present; substantive implementation |
| `packages/ui/src/game/__tests__/PlayerInput.test.ts` | Unit tests for all player-movement behaviours | VERIFIED | 290-line file; 32 tests covering speed, diagonals, bounds, 8 directions, input guards, lifecycle |
| `packages/ui/src/pages/OfficePage.tsx` | movePlayer in update(); attachInput/detachInput in lifecycle; handleClick teleport; render player sprite | VERIFIED | All 4 concerns present; 183-line file, fully substantive |
| `packages/ui/src/pages/__tests__/OfficePage.test.tsx` | Teleport test: cam.x === cam.targetX after NPC click | VERIFIED | Teleport test at line 163; also asserts player.x/y updated and targetX clamped |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| OfficePage.tsx | PlayerInput.ts | `movePlayer(gameState.player, getKeysDown(), deltaMs)` in engine.update() | WIRED | OfficePage.tsx line 66; import line 13 |
| OfficePage.tsx | Camera.ts | `cam.targetX = gameState.player.x - cam.viewportW / 2` then `updateCamera()` | WIRED | OfficePage.tsx lines 67–70 |
| OfficePage.tsx (handleClick) | gameState.camera | `cam.x = cam.targetX` after clamped targetX/Y assignment | WIRED | OfficePage.tsx lines 143–147 |
| OfficePage.tsx (render) | spriteStates.ts | `DIRECTION_ROWS[gameState.player.direction as Direction]` | WIRED | OfficePage.tsx lines 8–9 (import) and line 94 (usage) |
| OfficePage.tsx (lifecycle) | PlayerInput.ts | `attachInput()` after `engine.start()`; `detachInput()` in cleanup | WIRED | OfficePage.tsx lines 100–105 |

---

### Anti-Patterns Found

None found. No TODO/FIXME/PLACEHOLDER comments, no empty implementations, no stub return values in any phase-16 files.

---

### Test Results

| Suite | Pass | Fail | Notes |
|-------|------|------|-------|
| `PlayerInput.test.ts` | 32 | 0 | All specs green |
| `OfficePage.test.tsx` | 9 | 0 | Includes new teleport test; no regression |
| Full `pnpm --filter ui test --run` | 298 | 3 | 3 failures are pre-existing (eventsSlice, approvalsSlice, ApprovalInbox) — documented in `deferred-items.md` before phase 16 started; unrelated to player controls |

---

### Human Verification Required

The following behaviours require live browser testing and cannot be verified programmatically:

#### 1. WASD / Arrow Key Movement Feel

**Test:** Run `pnpm dev`, open the Office page, press W/A/S/D and arrow keys.
**Expected:** Player sprite moves smoothly in the correct direction at 120 px/s. Diagonal (W+D, S+A etc.) speed feels the same as cardinal. Player cannot walk off screen edges.
**Why human:** Frame-rate-independent smoothness, perceived speed, and visual bounds enforcement require live rendering.

#### 2. Click-to-Teleport

**Test:** Click an agent sprite on the canvas.
**Expected:** Camera snaps instantly (no visible lerp lag) to centre on the clicked NPC, AND the agent popup opens.
**Why human:** Instant vs. lerped snap requires live interaction to perceive.

#### 3. Input Isolation

**Test:** Open a text input or modal, then press WASD. Also press arrow keys on the Office page.
**Expected:** Player does not move while a text input/modal has keyboard focus. Arrow keys do not scroll the page.
**Why human:** Focus-state behaviour and scroll-prevention require manual interaction.

---

### Gaps Summary

No gaps. All automated must-haves are fully implemented, substantive, and wired. Three pre-existing test failures (eventsSlice, approvalsSlice, ApprovalInbox) are explicitly scoped out in `deferred-items.md` and were present before phase 16 began.

---

_Verified: 2026-04-11T11:00:00Z_
_Verifier: Claude (gsd-verifier)_
