---
phase: 22
slug: unified-session-chat-with-daemon-vs-external-capability-split
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm --filter @cockpit/daemon test --run ws && pnpm --filter @cockpit/ui test --run InstancePopupHub` |
| **Full suite command** | `pnpm --filter @cockpit/daemon test && pnpm --filter @cockpit/ui test` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @cockpit/daemon test --run ws && pnpm --filter @cockpit/ui test --run InstancePopupHub`
- **After every plan wave:** Run `pnpm --filter @cockpit/daemon test && pnpm --filter @cockpit/ui test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | CHAT-01 | unit/integration | `pnpm --filter @cockpit/daemon test --run ws` | ✅ | ⬜ pending |
| 22-01-02 | 01 | 1 | CHAT-02 | unit | `pnpm --filter @cockpit/daemon test --run codexAdapter` | ✅ | ⬜ pending |
| 22-01-03 | 01 | 1 | CHAT-03 | component | `pnpm --filter @cockpit/ui test --run InstancePopupHub && pnpm --filter @cockpit/ui test --run useSessionEvents` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/daemon/src/__tests__/ws-chat.test.ts` — chat capability + blocked-send behavior
- [ ] `packages/ui/src/__tests__/ChatPanel.test.tsx` — capability-gated composer behavior

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Managed/external session UX copy clarity | CHAT-02 | Product wording and UX affordance quality | Open popup for one managed and one external session; verify send enabled/disabled and explanatory state text |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
