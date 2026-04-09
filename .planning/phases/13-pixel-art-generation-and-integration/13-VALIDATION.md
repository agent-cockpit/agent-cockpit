---
phase: 13
slug: pixel-art-generation-and-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + Node.js scripts |
| **Config file** | vitest.config.ts |
| **Quick run command** | `pnpm test --run` |
| **Full suite command** | `pnpm test --run && node scripts/validate-sprites.js` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test --run`
- **After every plan wave:** Run `pnpm test --run && node scripts/validate-sprites.js`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-00-01 | 00 | 1 | sprite-sheet-exists | file-check | `node scripts/validate-sprites.js --character astronaut` | ❌ W0 | ⬜ pending |
| 13-00-02 | 00 | 1 | pipeline-runs | integration | `node scripts/build-sprite-sheet.js --character astronaut --dry-run` | ❌ W0 | ⬜ pending |
| 13-01-01 | 01 | 2 | all-10-sheets | file-check | `node scripts/validate-sprites.js --all` | ❌ W0 | ⬜ pending |
| 13-02-01 | 02 | 3 | agent-sprite-renders | unit | `pnpm test --run src/components/AgentSprite.test.tsx` | ❌ W0 | ⬜ pending |
| 13-02-02 | 02 | 3 | session-hash-mapping | unit | `pnpm test --run src/components/AgentSprite.test.tsx` | ❌ W0 | ⬜ pending |
| 13-03-01 | 03 | 4 | css-glow-states | visual | manual — inspect dev server | N/A | ⬜ pending |
| 13-03-02 | 03 | 4 | background-tiles | visual | manual — inspect Office Mode | N/A | ⬜ pending |
| 13-04-01 | 04 | 5 | tier2-assets-exist | file-check | `node scripts/validate-sprites.js --tier2` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/validate-sprites.js` — file existence checker for all sprite assets
- [ ] `scripts/build-sprite-sheet.js` — sprite sheet assembly pipeline (used in dry-run mode for validation)
- [ ] `src/components/AgentSprite.test.tsx` — unit tests for character assignment and direction rendering

*Wave 0 creates scripts and test stubs before generation begins.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CSS glow colors visible on agent states | SC-4 | Visual rendering — color accuracy requires human inspection | Load Office Mode, trigger each state (idle/blocked/completed/failed), verify correct glow color per character |
| Space station floor tiles render | SC-5 | Visual layout — tile alignment needs human review | Load Office Mode background, verify grid floor tileset renders correctly |
| Sprite animation plays smoothly | SC-1 | Animation quality — frame timing/smoothness is perceptual | Load Office Mode, observe idle animation for all visible characters |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
