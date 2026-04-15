---
phase: 26
slug: agent-face-cards-sidebar
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
| **Config file** | `packages/ui/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @cockpit/ui test -- MapSidebar` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @cockpit/ui test -- MapSidebar`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | sidebar-face-card | unit | `pnpm --filter @cockpit/ui test -- characterMapping` | ✅ extend existing | ⬜ pending |
| 26-01-02 | 01 | 1 | sidebar-face-card | manual | `ls packages/ui/public/sprites/faces/` | N/A | ⬜ pending |
| 26-02-01 | 02 | 2 | sidebar-face-card | unit | `pnpm --filter @cockpit/ui test -- MapSidebar` | ✅ extend existing | ⬜ pending |
| 26-02-02 | 02 | 2 | sidebar-face-card | unit | `pnpm --filter @cockpit/ui test -- MapSidebar` | ✅ extend existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files or framework installs needed.

- `packages/ui/src/components/layout/__tests__/MapSidebar.test.tsx` — extend with face avatar + fallback tests
- `packages/ui/src/components/office/characterMapping.ts` — extend with `characterFaceUrl` unit tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Face PNGs copied to public/sprites/faces/ | sidebar-face-card | Copy script output — not a browser test | Run `npx tsx scripts/copy-faces.ts` then `ls packages/ui/public/sprites/faces/` and verify 10 PNG files |
| Face avatar renders visually at correct size | sidebar-face-card | Visual QA | Open sidebar in dev server, confirm 32×32 rounded avatars appear per session row |
| Fallback initial renders when image missing | sidebar-face-card | Visual QA | Temporarily rename a face PNG, reload, confirm character initial shows (no broken-image box) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
