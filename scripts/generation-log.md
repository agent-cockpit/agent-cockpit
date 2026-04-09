# Phase 13 — Sprite Generation Log

## Astronaut

| Character | character_id | Base status | Idle frames | Blocked frames | Completed frames | Failed frames | Sheet status |
|-----------|-------------|-------------|-------------|----------------|-----------------|---------------|--------------|
| astronaut | c76f4e82-7eec-4443-96fa-501def9d1656 | done | 4 per dir | 8 per dir | 9 per dir | 7 per dir | done |

**Canvas frame size observed:** 92×92px (character ~55px tall, ~41px wide)
- PixelLab inflates the canvas by ~1.44× for a 64px request
- `build-spritesheet.ts` resizes each frame to 64×64 via `sharp.resize(fit:'contain')` before compositing
- FRAME_SIZE constant = 64 is correct; no adjustment needed for future characters

**Sprite sheet:** `packages/ui/public/sprites/astronaut-sheet.png`
- Dimensions: 576×2048px (9 cols × 64px wide = 576; 32 rows × 64px tall = 2048)
- Layout: 32 rows total (4 states × 8 directions)
  - Rows 0–7: idle (breathing-idle, 4 frames)
  - Rows 8–15: blocked (fight-stance-idle-8-frames, 8 frames)
  - Rows 16–23: completed (jumping-1, 9 frames)
  - Rows 24–31: failed (falling-back-death, 7 frames)

**Animation IDs in ZIP:**
- `animating-ab8f4362` → idle (4 frames × 8 dirs)
- `animating-2ab17eb3` → blocked (8 frames × 8 dirs)
- `animating-a99a4339` → completed (9 frames × 8 dirs)
- `falling_backward-d4c4df67` → failed (7 frames × 8 dirs)
