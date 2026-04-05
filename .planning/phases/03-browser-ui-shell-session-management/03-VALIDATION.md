---
phase: 3
slug: browser-ui-shell-session-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.workspace.ts (root) |
| **Quick run command** | `pnpm --filter ui test run` |
| **Full suite command** | `pnpm test run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter ui test run`
- **After every plan wave:** Run `pnpm test run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 0 | SESS-01 | unit | `pnpm --filter ui test run` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 1 | SESS-01 | unit | `pnpm --filter ui test run` | ❌ W0 | ⬜ pending |
| 3-01-03 | 01 | 1 | SESS-02 | unit | `pnpm --filter ui test run` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 1 | SESS-03 | unit | `pnpm --filter ui test run` | ❌ W0 | ⬜ pending |
| 3-02-02 | 02 | 1 | SESS-04 | unit | `pnpm --filter ui test run` | ❌ W0 | ⬜ pending |
| 3-03-01 | 03 | 2 | OPS-01 | unit | `pnpm --filter ui test run` | ❌ W0 | ⬜ pending |
| 3-03-02 | 03 | 2 | OPS-02 | unit | `pnpm --filter ui test run` | ❌ W0 | ⬜ pending |
| 3-03-03 | 03 | 2 | OPS-03 | unit | `pnpm --filter ui test run` | ❌ W0 | ⬜ pending |
| 3-03-04 | 03 | 2 | OPS-04 | unit | `pnpm --filter ui test run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/ui/src/__tests__/store.test.ts` — stubs for session store (SESS-01, SESS-03, SESS-04)
- [ ] `packages/ui/src/__tests__/SessionList.test.tsx` — stubs for session list rendering (SESS-01, SESS-02)
- [ ] `packages/ui/src/__tests__/OpsLayout.test.tsx` — stubs for ops mode navigation (OPS-01, OPS-02, OPS-03, OPS-04)
- [ ] `packages/ui/vitest.config.ts` — vitest config with jsdom environment

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-time WebSocket status updates visible in browser | SESS-01 | Requires live daemon + WebSocket connection | Open localhost UI, start a session, verify status indicator updates |
| Launch session copy-to-clipboard flow | SESS-02 | Requires clipboard interaction | Click "Launch Session", verify config command appears in clipboard |
| Attach to running session receives events | SESS-04 | Requires live daemon with active session | Click attach on running session, verify events stream in |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
