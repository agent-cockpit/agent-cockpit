---
phase: 7
slug: memory-panel
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-07
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x (existing in both packages) |
| **Config file** | `vitest.config.ts` at root (`projects: ['packages/*']`) |
| **Quick run command** | `pnpm vitest run --project packages/ui` |
| **Full suite command** | `pnpm vitest run` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --project packages/ui`
- **After every plan wave:** Run `pnpm vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 0 | MEM-01..04 | unit (RTL) | `pnpm vitest run --project packages/ui` | ❌ Wave 0 | ⬜ pending |
| 07-01-02 | 01 | 0 | MEM-01, MEM-03 | unit (daemon) | `pnpm vitest run --project packages/daemon` | ❌ Wave 0 | ⬜ pending |
| 07-02-01 | 02 | 1 | MEM-01, MEM-02 | unit (RTL + daemon) | `pnpm vitest run` | ✅ Wave 0 | ⬜ pending |
| 07-02-02 | 02 | 1 | MEM-03 | unit (RTL + daemon) | `pnpm vitest run` | ✅ Wave 0 | ⬜ pending |
| 07-02-03 | 02 | 1 | MEM-04 | unit (RTL + daemon) | `pnpm vitest run` | ✅ Wave 0 | ⬜ pending |
| 07-03-01 | 03 | 2 | MEM-01..04 | unit (RTL) | `pnpm vitest run --project packages/ui` | ✅ Wave 0 | ⬜ pending |
| 07-03-02 | 03 | 2 | MEM-01..04 | unit (RTL) | `pnpm vitest run --project packages/ui` | ✅ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/ui/src/__tests__/MemoryPanel.test.tsx` — RTL tests covering MEM-01 through MEM-04
- [ ] `packages/daemon/src/__tests__/memory-reader.test.ts` — unit tests for memoryReader helpers
- [ ] `packages/daemon/src/__tests__/memory-notes.test.ts` — unit tests for memory_notes CRUD
- [ ] `packages/daemon/src/memory/` directory — new module skeleton (empty files acceptable at Wave 0)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CLAUDE.md edit saves correctly to disk | MEM-02 | File system write requires running daemon | Open memory panel, edit textarea, click Save, verify file contents changed on disk |
| Active-session notice appears during live session | MEM-02 | Requires live session running | Start a session, open memory panel, confirm warning banner present |
| New note persists after daemon restart | MEM-03 | Requires restarting the daemon process | Create note, restart daemon, reload UI, confirm note is visible |
| Approve suggestion writes to correct memory file | MEM-04 | Requires real MemoryWriteEvent from Claude | Trigger memory suggestion from agent, approve in UI, verify file written |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
