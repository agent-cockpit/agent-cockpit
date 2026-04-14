---
phase: 23
slug: approval-hook-reliability-across-providers-and-subagents
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 23 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm --filter @cockpit/daemon test --run approval-queue && pnpm --filter @cockpit/ui test --run approvalsSlice` |
| **Full suite command** | `pnpm --filter @cockpit/daemon test && pnpm --filter @cockpit/ui test` |
| **Estimated runtime** | ~150 seconds |

## Sampling Rate

- **After every task commit:** quick run command
- **After every wave:** full suite command
- **Before `$gsd-verify-work`:** full suite green
- **Max feedback latency:** 150 seconds

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | APPR-HOOK-01 | unit | `pnpm --filter @cockpit/daemon test --run hookParser && pnpm --filter @cockpit/daemon test --run hook-server` | ✅ | ⬜ pending |
| 23-01-02 | 01 | 1 | APPR-HOOK-02 | integration | `pnpm --filter @cockpit/daemon test --run approval-queue && pnpm --filter @cockpit/daemon test --run codexAdapter` | ✅ | ⬜ pending |
| 23-01-03 | 01 | 1 | APPR-HOOK-03 | store replay | `pnpm --filter @cockpit/ui test --run approvalsSlice` | ✅ | ⬜ pending |

## Wave 0 Requirements

- [ ] `packages/daemon/src/__tests__/approval-reliability-matrix.test.ts`

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live provider parity (Claude vs Codex) | APPR-HOOK-01 | Requires running providers | Trigger one risky action in each provider and verify approval create+resolve cycle |

## Validation Sign-Off

- [ ] All tasks have automated verify coverage
- [ ] Sampling continuity preserved
- [ ] No watch-mode commands
- [ ] Feedback latency under target
- [ ] `nyquist_compliant: true` set when phase is accepted

**Approval:** pending
