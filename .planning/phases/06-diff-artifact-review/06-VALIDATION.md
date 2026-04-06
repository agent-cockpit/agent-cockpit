---
phase: 6
slug: diff-artifact-review
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `packages/ui/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @cockpit/ui test --run` |
| **Full suite command** | `pnpm -r test --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @cockpit/ui test --run`
- **After every plan wave:** Run `pnpm -r test --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 0 | DIFF-01, DIFF-02, DIFF-03 | unit (RTL) | `pnpm --filter @cockpit/ui test --run DiffPanel` | ❌ Wave 0 | ⬜ pending |
| 6-01-02 | 01 | 1 | DIFF-01 | unit (RTL) | `pnpm --filter @cockpit/ui test --run DiffPanel` | ❌ Wave 0 | ⬜ pending |
| 6-01-03 | 01 | 1 | DIFF-02 | unit (RTL) | `pnpm --filter @cockpit/ui test --run DiffPanel` | ❌ Wave 0 | ⬜ pending |
| 6-01-04 | 01 | 1 | DIFF-03 | unit (RTL) | `pnpm --filter @cockpit/ui test --run DiffPanel` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/ui/src/__tests__/DiffPanel.test.tsx` — stubs for DIFF-01, DIFF-02, DIFF-03

*All test files are new — Wave 0 must create them before implementation tasks run.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| File tree visually updates as events arrive (live session) | DIFF-01 | Requires live daemon + real-time SSE | Start a live session, observe file tree updating in browser |
| Diff coloring readable in light and dark mode | DIFF-02 | Visual regression not captured by RTL | Load DiffPanel in browser, toggle theme |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
