---
phase: 15
slug: game-engine-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + jsdom + React Testing Library |
| **Config file** | `packages/ui/vite.config.ts` (test block) |
| **Quick run command** | `pnpm --filter ui test --run` |
| **Full suite command** | `pnpm --filter ui test --run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter ui test --run`
- **After every plan wave:** Run `pnpm --filter ui test --run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | game-loop | unit | `pnpm --filter ui test --run GameEngine` | ❌ W0 | ⬜ pending |
| 15-01-02 | 01 | 1 | gamestate-store | unit | `pnpm --filter ui test --run GameState` | ❌ W0 | ⬜ pending |
| 15-01-03 | 01 | 1 | game-loop | unit | `pnpm --filter ui test --run GameEngine` | ❌ W0 | ⬜ pending |
| 15-02-01 | 02 | 2 | camera-system | unit | `pnpm --filter ui test --run Camera` | ❌ W0 | ⬜ pending |
| 15-02-02 | 02 | 2 | camera-system | unit | `pnpm --filter ui test --run Camera` | ❌ W0 | ⬜ pending |
| 15-02-03 | 02 | 2 | camera-system | manual | — | — | ⬜ pending |
| 15-03-01 | 03 | 3 | game-loop | manual | — | — | ⬜ pending |
| 15-03-02 | 03 | 3 | gamestate-store | manual | — | — | ⬜ pending |
| 15-03-03 | 03 | 3 | camera-system | manual | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/ui/src/game/__tests__/GameEngine.test.ts` — stubs for game-loop (rAF start/stop, delta time, pause/resume, double-start guard)
- [ ] `packages/ui/src/game/__tests__/GameState.test.ts` — stubs for gamestate-store (initial state shape, mutation without React notify)
- [ ] `packages/ui/src/game/__tests__/Camera.test.ts` — stubs for camera-system (lerp toward target, bounds clamping, follow)

*Existing Vitest infrastructure covers all phase requirements — no new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Canvas renders below React overlay (z-index) | camera-system | jsdom has no real CSS stacking context | Open OfficePage in browser, open DevTools, confirm canvas z-index < React overlay z-index; click popup confirms dialog opens above canvas |
| Radix Dialog portals render above canvas | game-loop | Portal renders to document.body, can't be asserted in jsdom | Click an agent, confirm InstancePopupHub opens and is fully visible with no canvas occlusion |
| 60 FPS maintained | game-loop | Performance can't be asserted in Vitest | Open browser Performance tab, record 5s on OfficePage, confirm ~60 frames/s in flame chart |
| Canvas resizes on window resize | camera-system | jsdom ResizeObserver is a stub | Resize browser window, confirm canvas fills viewport with no gaps |
| Existing sprite positions preserved | gamestate-store | Visual regression not testable in unit tests | Load OfficePage with active sessions, confirm agent sprites appear at correct grid positions after Canvas mount |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
