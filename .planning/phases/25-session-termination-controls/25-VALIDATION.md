---
phase: 25
slug: session-termination-controls
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 25 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm --filter @cockpit/daemon test --run ws && pnpm --filter @cockpit/ui test --run SessionListPanel` |
| **Full suite command** | `pnpm --filter @cockpit/daemon test && pnpm --filter @cockpit/ui test` |
| **Estimated runtime** | ~130 seconds |

## Sampling Rate

- **After each task:** quick run command
- **After wave:** full suite command
- **Before verify-work:** full suite green
- **Max feedback latency:** 130 seconds

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | SESS-KILL-01 | unit/integration | `pnpm --filter @cockpit/daemon test --run ws && pnpm --filter @cockpit/daemon test --run launch-session` | ✅ | ⬜ pending |
| 25-01-02 | 01 | 1 | SESS-KILL-02 | provider runtime | `pnpm --filter @cockpit/daemon test --run codexAdapter` | ✅ | ⬜ pending |
| 25-01-03 | 01 | 1 | SESS-KILL-03 | component | `pnpm --filter @cockpit/ui test --run SessionListPanel && pnpm --filter @cockpit/ui test --run InstancePopupHub` | ✅ | ⬜ pending |

## Wave 0 Requirements

- [ ] `packages/daemon/src/__tests__/session-terminate.test.ts`
- [ ] `packages/ui/src/__tests__/SessionTerminateControls.test.tsx`

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Kill UX confidence and confirmation copy | SESS-KILL-01 | UX quality | Execute kill on managed session and verify explicit confirmation + result states |

## Validation Sign-Off

- [ ] Automated verification mapped for all tasks
- [ ] Regression checks complete
- [ ] `nyquist_compliant: true` set when accepted

**Approval:** pending
