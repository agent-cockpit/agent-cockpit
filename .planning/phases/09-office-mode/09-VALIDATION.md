---
phase: 9
slug: office-mode
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x + React Testing Library 16.x |
| **Config file** | `packages/ui/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @cockpit/ui test --run spriteStates` |
| **Full suite command** | `pnpm --filter @cockpit/ui test --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @cockpit/ui test --run spriteStates`
- **After every plan wave:** Run `pnpm --filter @cockpit/ui test --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 0 | OFFICE-01 | unit | `pnpm --filter @cockpit/ui test --run spriteStates` | ❌ W0 | ⬜ pending |
| 09-01-02 | 01 | 0 | OFFICE-01 | unit | `pnpm --filter @cockpit/ui test --run AgentSprite` | ❌ W0 | ⬜ pending |
| 09-01-03 | 01 | 0 | OFFICE-04 | unit | `pnpm --filter @cockpit/ui test --run useLocalStorage` | ❌ W0 | ⬜ pending |
| 09-01-04 | 01 | 1 | OFFICE-01 | unit | `pnpm --filter @cockpit/ui test --run spriteStates` | ❌ W0 | ⬜ pending |
| 09-02-01 | 02 | 1 | OFFICE-02 | unit | `pnpm --filter @cockpit/ui test --run AgentHoverCard` | ❌ W0 | ⬜ pending |
| 09-02-02 | 02 | 1 | OFFICE-03 | unit | `pnpm --filter @cockpit/ui test --run OfficePage` | ❌ W0 | ⬜ pending |
| 09-03-01 | 03 | 2 | OFFICE-04 | unit | `pnpm --filter @cockpit/ui test --run OfficePage` | ❌ W0 | ⬜ pending |
| 09-03-02 | 03 | 2 | Performance | manual | Browser DevTools Performance tab | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/ui/src/__tests__/spriteStates.test.ts` — unit tests for `deriveAgentState`, covers OFFICE-01
- [ ] `packages/ui/src/__tests__/AgentSprite.test.tsx` — renders sprite with correct CSS class for each `agentAnimState` prop
- [ ] `packages/ui/src/__tests__/AgentHoverCard.test.tsx` — renders all 7 required OFFICE-02 fields
- [ ] `packages/ui/src/__tests__/OfficePage.test.tsx` — drag delta applied to positions, localStorage read on mount, click navigation
- [ ] `packages/ui/src/__tests__/useLocalStorage.test.ts` — init from storage, write on set, SSR-safe empty-storage fallback
- [ ] `packages/ui/src/sprites/agent-sheet.png` — placeholder sprite sheet (8-row × 4-frame solid-color blocks) to avoid 404 in tests
- [ ] `pnpm --filter @cockpit/ui add @dnd-kit/core @dnd-kit/utilities` — install dnd-kit
- [ ] `pnpm --filter @cockpit/ui add @radix-ui/react-hover-card` — install HoverCard if not already transitive

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sustains ≥45fps with 10 sessions at 10 events/s each | OFFICE-01 (success criterion 5) | jsdom does not execute CSS animations or run a real browser compositor | Chrome DevTools > Performance > Record; open Office mode with 10 active sessions; inject events at 10/s; verify no frame drops below 45fps in the flame chart |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
