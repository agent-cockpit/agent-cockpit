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

---

## Monkey

| Character | character_id | Base status | Idle frames | Blocked frames | Completed frames | Failed frames | Sheet status |
|-----------|-------------|-------------|-------------|----------------|-----------------|---------------|--------------|
| monkey | d3014ddb-e8ae-4176-b329-e523b29e1542 | done | 4 per dir | 8 per dir | 9 per dir | 7 per dir | done |

**Animation IDs in ZIP:**
- `animating-d1a175ef` → idle (4 frames × 8 dirs)
- `animating-91b60393` → blocked (8 frames × 8 dirs)
- `animating-ea06a4c0` → completed (9 frames × 8 dirs)
- `falling_backward-64a40733` → failed (7 frames × 8 dirs)

**Sprite sheet:** `packages/ui/public/sprites/monkey-sheet.png` — 576×2048px

---

## Caveman

| Character | character_id | Base status | Idle frames | Blocked frames | Completed frames | Failed frames | Sheet status |
|-----------|-------------|-------------|-------------|----------------|-----------------|---------------|--------------|
| caveman | 43f05887-afb1-474d-855b-754cad27025e | done | 4 per dir | 8 per dir | 9 per dir | 7 per dir | done |

**Animation IDs in ZIP:**
- `animating-4c1a1e2d` → idle (4 frames × 8 dirs)
- `animating-28b1b3f8` → blocked (8 frames × 8 dirs)
- `animating-cdba88b5` → completed (9 frames × 8 dirs)
- `falling_backward-eccf4796` → failed (7 frames × 8 dirs)

**Note:** Original description ("caveman wearing a space helmet over fur loincloth, club in hand") failed content filter repeatedly. Successful description: "prehistoric human in fur outfit with space helmet, holding a club, pixel art, chibi style"

**Sprite sheet:** `packages/ui/public/sprites/caveman-sheet.png` — 576×2048px

---

## Ghost

| Character | character_id | Base status | Idle frames | Blocked frames | Completed frames | Failed frames | Sheet status |
|-----------|-------------|-------------|-------------|----------------|-----------------|---------------|--------------|
| ghost | b568e405-2a98-40ac-885c-93097d2e7ef6 | done | 4 per dir | 8 per dir | 9 per dir | 7 per dir | done |

**Animation IDs in ZIP:**
- `animating-37b6a687` → idle (4 frames × 8 dirs)
- `animating-a32b02cc` → blocked (8 frames × 8 dirs)
- `animating-821313ab` → completed (9 frames × 8 dirs)
- `falling_backward-eb3bd210` → failed (7 frames × 8 dirs)

**Sprite sheet:** `packages/ui/public/sprites/ghost-sheet.png` — 576×2048px

---

## Ninja

| Character | character_id | Base status | Idle frames | Blocked frames | Completed frames | Failed frames | Sheet status |
|-----------|-------------|-------------|-------------|----------------|-----------------|---------------|--------------|
| ninja | 620dc52a-61be-4e5d-8dab-8bc36ddc1008 | done | 4 per dir | 8 per dir | 9 per dir | 7 per dir | done |

**Animation IDs in ZIP:**
- `animating-598ca548` → idle (4 frames × 8 dirs)
- `animating-de917bac` → blocked (8 frames × 8 dirs)
- `animating-9dd129ae` → completed (9 frames × 8 dirs)
- `falling_backward-1e4281d0` → failed (7 frames × 8 dirs)

**Sprite sheet:** `packages/ui/public/sprites/ninja-sheet.png` — 576×2048px

---

## Pirate

| Character | character_id | Base status | Idle frames | Blocked frames | Completed frames | Failed frames | Sheet status |
|-----------|-------------|-------------|-------------|----------------|-----------------|---------------|--------------|
| pirate | 33c84935-d665-4a8a-83c2-0d2e86f533cb | done | 4 per dir | 8 per dir | 9 per dir | 7 per dir | done |

**Animation IDs in ZIP:**
- `animating-85d4d918` → idle (4 frames × 8 dirs)
- `animating-d25136b6` → blocked (8 frames × 8 dirs)
- `animating-4b884fb7` → completed (9 frames × 8 dirs)
- `falling_backward-2ecc716e` → failed (7 frames × 8 dirs)

**Sprite sheet:** `packages/ui/public/sprites/pirate-sheet.png` — 576×2048px

---

## Medicine Woman

| Character | character_id | Base status | Idle frames | Blocked frames | Completed frames | Failed frames | Sheet status |
|-----------|-------------|-------------|-------------|----------------|-----------------|---------------|--------------|
| medicine-woman | 8f097b90-a825-48ea-8d4e-b863ee2159ed | done | 4 per dir | 8 per dir | 9 per dir | 7 per dir | done |

**Animation IDs in ZIP:**
- `animating-161fef7f` → idle (4 frames × 8 dirs)
- `animating-d359e6e2` → blocked (8 frames × 8 dirs)
- `animating-6cbf5a68` → completed (9 frames × 8 dirs)
- `falling_backward-72d2a9ea` → failed (7 frames × 8 dirs)

**Note:** Original description ("medicine woman in traditional headdress combined with space suit elements") failed content filter repeatedly. Successful description: "indigenous healer in traditional headdress and space suit, carrying medicine bag, wise expression, pixel art, chibi style"

**Sprite sheet:** `packages/ui/public/sprites/medicine-woman-sheet.png` — 576×2048px

---

## Tier 2/3 Icons and Badges

| Asset | Object ID | Size | Output |
|-------|-----------|------|--------|
| icon-timeline | 8e5421f0-6155-41ea-be22-3b2aa6467d69 | 32×32 | icon-timeline.png |
| icon-memory | e80d11d6-ab8c-4864-94a7-17132131ad74 | 32×32 | icon-memory.png |
| icon-approvals | cfd43670-1837-4da2-9271-9759b8d25c41 | 32×32 | icon-approvals.png |
| icon-diff | a17a45d2-7e25-44fe-a9b1-925844585fad | 32×32 | icon-diff.png |
| icon-history | a9cac5bd-4360-49aa-a34a-b1b58924fab6 | 32×32 | icon-history.png |
| badge-low | 3c3161c9-30cf-4b82-954c-540517519e63 | 48×48 | badge-low.png |
| badge-medium | 88dd0f65-8782-4b17-b430-fac606283191 | 48×48 | badge-medium.png |
| badge-high | 12e4e61e-3647-49f6-a11c-fd4c01aad38e | 48×48 | badge-high.png |
| badge-critical | dcabffcb-89b6-407c-8a20-44c341eee1e1 | 48×48 | badge-critical.png |
| loading-animation | 8be9f8bc-cd82-4d0c-9e39-2b5d8dd0ceea | 32×32 | loading-animation.png |

**Tool:** `create_map_object` — all generated 2026-04-10
**Note:** Map objects stored 8h only — regenerate from IDs if needed
