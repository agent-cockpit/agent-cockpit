---
phase: 1
slug: daemon-core
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.x |
| **Config file** | `vitest.config.ts` at repo root — Wave 0 gap (does not yet exist) |
| **Quick run command** | `pnpm --filter @cockpit/shared test run && pnpm --filter @cockpit/daemon test run` |
| **Full suite command** | `pnpm test run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @cockpit/shared test run && pnpm --filter @cockpit/daemon test run`
- **After every plan wave:** Run `pnpm test run` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | DAEMON-01 | unit | `pnpm --filter @cockpit/shared test run` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 0 | DAEMON-01 | unit (import smoke) | `pnpm --filter @cockpit/daemon test run` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 0 | DAEMON-02 | unit | `pnpm --filter @cockpit/daemon test run` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 0 | DAEMON-02 | unit | `pnpm --filter @cockpit/daemon test run` | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 0 | DAEMON-03 | integration | `pnpm --filter @cockpit/daemon test run` | ❌ W0 | ⬜ pending |
| 1-03-02 | 03 | 0 | DAEMON-03 | integration | `pnpm --filter @cockpit/daemon test run` | ❌ W0 | ⬜ pending |
| 1-03-03 | 03 | 0 | DAEMON-03 | integration | `pnpm --filter @cockpit/daemon test run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/shared/src/__tests__/events.test.ts` — stubs for DAEMON-01 schema validation
- [ ] `packages/daemon/src/__tests__/database.test.ts` — stubs for DAEMON-02 WAL mode + insert
- [ ] `packages/daemon/src/__tests__/ws-catchup.test.ts` — stubs for DAEMON-03 catch-up protocol
- [ ] `packages/shared/vitest.config.ts` — per-package vitest config
- [ ] `packages/daemon/vitest.config.ts` — per-package vitest config
- [ ] `vitest.config.ts` (root) — projects config with `test: { projects: ['packages/*'] }`
- [ ] `pnpm-workspace.yaml` — monorepo workspace definition
- [ ] Framework install: `pnpm add -D vitest tsx typescript` (root) + `pnpm add -D vitest` per package

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Daemon process survives restart and browser tab recovers full state | DAEMON-02 | Requires process kill/restart cycle | Start daemon, inject events, kill process, restart, reconnect browser tab, verify all events present |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
