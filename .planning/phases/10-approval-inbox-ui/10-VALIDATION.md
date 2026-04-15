---
phase: 10
slug: approval-inbox-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x + @testing-library/react 16 |
| **Config file** | `packages/ui/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @cockpit/ui test --run` |
| **Full suite command** | `pnpm --filter @cockpit/ui test --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @cockpit/ui test --run`
- **After every plan wave:** Run `pnpm --filter @cockpit/ui test --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 0 | APPR-01, APPR-04 | unit | `pnpm --filter @cockpit/ui test --run approvalsSlice` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 0 | APPR-01, APPR-02, APPR-03, APPR-04 | unit | `pnpm --filter @cockpit/ui test --run ApprovalInbox` | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 1 | APPR-01 | unit | `pnpm --filter @cockpit/ui test --run approvalsSlice` | ❌ W0 | ⬜ pending |
| 10-01-04 | 01 | 1 | APPR-03 | unit | `pnpm --filter @cockpit/ui test --run ApprovalInbox` | ❌ W0 | ⬜ pending |
| 10-01-05 | 01 | 1 | APPR-01, APPR-02, APPR-03, APPR-04 | unit | `pnpm --filter @cockpit/ui test --run ApprovalInbox` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/ui/src/__tests__/approvalsSlice.test.ts` — stubs for APPR-01, APPR-04 (slice reducers)
- [ ] `packages/ui/src/__tests__/ApprovalInbox.test.tsx` — stubs for APPR-01, APPR-02, APPR-03, APPR-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Approve/Deny/Always-Allow buttons disabled when WebSocket disconnected | APPR-03 | Requires live WS connection state | Kill WS server, verify buttons are disabled with reconnecting badge |
| Acting on approval removes it from inbox immediately (optimistic update) | APPR-04 | Requires real interaction flow | Click Approve on a pending approval; verify it disappears without reload |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
