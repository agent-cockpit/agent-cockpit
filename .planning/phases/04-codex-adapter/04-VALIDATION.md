---
phase: 4
slug: codex-adapter
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `packages/daemon/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @cockpit/daemon test --run` |
| **Full suite command** | `pnpm --filter @cockpit/daemon test --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @cockpit/daemon test --run`
- **After every plan wave:** Run `pnpm --filter @cockpit/daemon test --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-??-01 | 01 | 0 | DAEMON-05 | unit | `pnpm --filter @cockpit/daemon test --run codexParser` | ❌ W0 | ⬜ pending |
| 4-??-02 | 01 | 0 | DAEMON-05 | unit | `pnpm --filter @cockpit/daemon test --run codexAdapter` | ❌ W0 | ⬜ pending |
| 4-??-03 | 01 | 1 | DAEMON-05 | unit | `pnpm --filter @cockpit/daemon test --run codexParser` | ❌ W0 | ⬜ pending |
| 4-??-04 | 01 | 1 | DAEMON-05 | unit | `pnpm --filter @cockpit/daemon test --run codexAdapter` | ❌ W0 | ⬜ pending |
| 4-??-05 | 01 | 1 | DAEMON-05 | unit | `pnpm --filter @cockpit/daemon test --run codexAdapter` | ❌ W0 | ⬜ pending |
| 4-??-06 | 01 | 2 | DAEMON-05 | unit | `pnpm --filter @cockpit/daemon test --run codexAdapter` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/daemon/src/adapters/codex/__tests__/codexParser.test.ts` — stubs for JSONL → NormalizedEvent mapping (DAEMON-05)
- [ ] `packages/daemon/src/adapters/codex/__tests__/codexAdapter.test.ts` — stubs for approval reply, parse error resilience, session resume (DAEMON-05)
- [ ] `packages/daemon/src/db/database.ts` — `codex_sessions` table DDL added to existing schema block

*(Framework already configured — no new test infrastructure needed)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `codex app-server` binary not on PATH | DAEMON-05 | Requires missing binary to simulate ENOENT | Remove `codex` from PATH, start session via POST /api/sessions with mode=codex, verify graceful error event emitted |
| Session resume across daemon restart | DAEMON-05 | Requires real process lifecycle | Start codex session, kill daemon, restart, verify thread/resume called with stored threadId and events replay in UI |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
