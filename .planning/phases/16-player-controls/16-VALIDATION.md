---
phase: 16
slug: player-controls
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/ui/vite.config.ts |
| **Quick run command** | `cd /Users/leostuart/agent-cockpit/packages/ui && npx vitest run src/game/__tests__/` |
| **Full suite command** | `cd /Users/leostuart/agent-cockpit && pnpm --filter ui test --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/game/__tests__/`
- **After every plan wave:** Run `pnpm --filter ui test --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | player-movement | unit | `npx vitest run src/game/__tests__/PlayerInput.test.ts` | ❌ W0 | ⬜ pending |
| 16-01-02 | 01 | 1 | player-movement | unit | `npx vitest run src/game/__tests__/PlayerInput.test.ts` | ❌ W0 | ⬜ pending |
| 16-01-03 | 01 | 1 | input-tracking | unit | `npx vitest run src/game/__tests__/PlayerInput.test.ts` | ❌ W0 | ⬜ pending |
| 16-02-01 | 02 | 2 | click-to-teleport | unit | `npx vitest run src/pages/__tests__/OfficePage.test.tsx` | ✅ | ⬜ pending |
| 16-02-02 | 02 | 2 | player-movement | unit | `npx vitest run src/game/__tests__/PlayerInput.test.ts` | ❌ W0 | ⬜ pending |
| 16-02-03 | 02 | 2 | player-movement | manual | See Manual-Only below | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/ui/src/game/__tests__/PlayerInput.test.ts` — stubs for player-movement, input-tracking

*Existing infrastructure (vitest, setupTests.ts with jsdom stubs) covers all other phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Player sprite visible on canvas facing correct direction | player-movement | Canvas rendering not testable in jsdom | Run `pnpm dev`, open Office page, press WASD — confirm sprite appears and faces direction of movement |
| WASD input ignored when typing in text field | input-tracking | Requires real browser focus events | Open a popup/text input, press WASD — confirm player does not move |
| Camera centers on NPC after canvas click | click-to-teleport | Visual camera position not testable in jsdom | Click an agent sprite on canvas — confirm camera snaps to center on that agent |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
