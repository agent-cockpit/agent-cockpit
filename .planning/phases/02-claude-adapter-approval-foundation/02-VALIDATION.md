---
phase: 2
slug: claude-adapter-approval-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (or package.json scripts) |
| **Quick run command** | `npm run test -- --run` |
| **Full suite command** | `npm run test -- --run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run`
- **After every plan wave:** Run `npm run test -- --run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | DAEMON-04 | unit | `npm run test -- --run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | APPR-01 | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 1 | APPR-02 | integration | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 2 | APPR-03 | integration | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 2 | APPR-04 | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 2-02-03 | 02 | 2 | APPR-05 | integration | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 2 | APPR-06 | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 2-04-01 | 04 | 3 | NOTIF-01 | manual | N/A | N/A | ⬜ pending |
| 2-04-02 | 04 | 3 | NOTIF-02 | manual | N/A | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/daemon/src/__tests__/hook-server.test.ts` — stubs for DAEMON-04, APPR-01, APPR-02
- [ ] `packages/daemon/src/__tests__/approval-queue.test.ts` — stubs for APPR-03, APPR-04, APPR-05
- [ ] `packages/daemon/src/__tests__/approval-timeout.test.ts` — stubs for APPR-06
- [ ] Shared vitest fixtures / test DB setup in `packages/daemon/src/__tests__/helpers/`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| In-app notification fires on approval needed | NOTIF-01 | Requires browser UI and live daemon | Start daemon, configure Claude Code hooks, trigger a tool call, verify notification appears in app |
| Desktop OS notification fires when tab is backgrounded | NOTIF-02 | Requires OS notification permission and background tab state | Start session, background the browser tab, trigger an approval, verify OS notification appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
