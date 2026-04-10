# Phase 13 — Sprite Generation Log

## Robot

| Character | character_id | Base status | Idle frames | Blocked frames | Completed frames | Failed frames | Sheet status |
|-----------|-------------|-------------|-------------|----------------|-----------------|---------------|--------------|
| robot | c4388cfb-6cf0-4b71-92b6-67d622da74c7 | done | 4 per dir | 8 per dir | 9 per dir | 7 per dir | done |

**Animation IDs in ZIP:**
- `animating-87f0090a` → idle (4 frames × 8 dirs)
- `animating-4225c6db` → blocked (8 frames × 8 dirs)
- `animating-ee13fedb` → completed (9 frames × 8 dirs)
- `falling_backward-753b95bc` → failed (7 frames × 8 dirs)

**Sprite sheet:** `packages/ui/public/sprites/robot-sheet.png` — 576×2048px

---

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

---

## Alien

| Character | character_id | Base status | Idle frames | Blocked frames | Completed frames | Failed frames | Sheet status |
|-----------|-------------|-------------|-------------|----------------|-----------------|---------------|--------------|
| alien | a3c2ae45-dc07-41e0-8bd6-0dd30beed8da | done | 4 per dir | 8 per dir | 9 per dir | 7 per dir | done |

**Animation IDs in ZIP:**
- `animating-c35e5cdf` → idle (4 frames × 8 dirs)
- `animating-1c2d3257` → blocked (8 frames × 8 dirs)
- `animating-363203d4` → completed (9 frames × 8 dirs)
- `falling_backward-e1001753` → failed (7 frames × 8 dirs)

**Sprite sheet:** `packages/ui/public/sprites/alien-sheet.png` — 576×2048px

---

## Hologram

| Character | character_id | Base status | Idle frames | Blocked frames | Completed frames | Failed frames | Sheet status |
|-----------|-------------|-------------|-------------|----------------|-----------------|---------------|--------------|
| hologram | ba5d7c02-678c-41a3-a27a-3b546a21dcf6 | done | 4 per dir | 8 per dir | 9 per dir | 7 per dir | done |

**Animation IDs in ZIP:**
- `animating-143603db` → idle (4 frames × 8 dirs)
- `animating-98515b59` → blocked (8 frames × 8 dirs)
- `animating-45f4e55c` → completed (9 frames × 8 dirs)
- `falling_backward-b0db7a33` → failed (7 frames × 8 dirs)

**Sprite sheet:** `packages/ui/public/sprites/hologram-sheet.png` — 576×2048px
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
