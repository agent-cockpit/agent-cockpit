---
plan: "01"
phase: 13-pixel-art-generation-and-integration
status: completed
wave: 2
completed: 2026-04-10
---

# Plan 13-01 Summary — Bulk Character Generation

## What Was Built

All 9 remaining characters generated, animated, and assembled into sprite sheets. All 10/10 characters pass `validate-sprites.ts --all`.

### Characters Generated

| Character | character_id | Sheet |
|-----------|-------------|-------|
| robot | c4388cfb-6cf0-4b71-92b6-67d622da74c7 | robot-sheet.png ✅ |
| alien | a3c2ae45-dc07-41e0-8bd6-0dd30beed8da | alien-sheet.png ✅ |
| hologram | ba5d7c02-678c-41a3-a27a-3b546a21dcf6 | hologram-sheet.png ✅ |
| monkey | d3014ddb-e8ae-4176-b329-e523b29e1542 | monkey-sheet.png ✅ |
| caveman | 43f05887-afb1-474d-855b-754cad27025e | caveman-sheet.png ✅ |
| ghost | b568e405-2a98-40ac-885c-93097d2e7ef6 | ghost-sheet.png ✅ |
| ninja | 620dc52a-61be-4e5d-8dab-8bc36ddc1008 | ninja-sheet.png ✅ |
| pirate | 33c84935-d665-4a8a-83c2-0d2e86f533cb | pirate-sheet.png ✅ |
| medicine-woman | 8f097b90-a825-48ea-8d4e-b863ee2159ed | medicine-woman-sheet.png ✅ |

All sheets: 576×2048px (9 cols × 64px = 576; 32 rows × 64px = 2048)

### Artifacts

- `packages/ui/public/sprites/{character}-sheet.png` — all 10 characters
- `packages/ui/public/sprites/{character}-manifest.json` — all 10 characters
- `assets/raw/{character}/{state}/{direction}/frame-N.png` — all source frames
- `scripts/generation-log.md` — complete with all 10 character IDs and animation IDs

## Key Learnings

1. **Content filter issues** — "caveman" + "club in hand" and "medicine woman" + "traditional headdress" failed repeatedly. Simplified/rephrased descriptions worked.
2. **8-slot limit is strict** — must wait for full animation completion before queuing next (HTTP 423 on download if any jobs pending).
3. **ETAs are useless** — 170s remaining after 7 minutes is common. Just keep polling at 30-60s intervals.
4. **zsh incompatibility** — `declare -A` associative arrays don't work in zsh; use `case` statements for state mapping.
5. **Animation ID → state mapping** by frame count in south/ dir: 4=idle, 8=blocked, 9=completed, 7=failed.
6. **ZIP metadata.json** has the full character UUID at `character.id`.

## Verification

```
npx tsx scripts/validate-sprites.ts --all
# 20/20 files OK — all 10 characters pass
```
