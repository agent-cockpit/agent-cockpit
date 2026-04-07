---
phase: 8
slug: session-history-search
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x / vitest (React Testing Library for UI) |
| **Config file** | jest.config.ts / vitest.config.ts |
| **Quick run command** | `npm test -- --testPathPattern=08` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=08`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 0 | HIST-01 | unit | `npm test -- --testPathPattern=fts5` | ❌ W0 | ⬜ pending |
| 8-01-02 | 01 | 0 | HIST-01 | unit | `npm test -- --testPathPattern=search` | ❌ W0 | ⬜ pending |
| 8-01-03 | 01 | 1 | HIST-02 | unit | `npm test -- --testPathPattern=sessions` | ❌ W0 | ⬜ pending |
| 8-02-01 | 02 | 1 | HIST-01 | integration | `npm test -- --testPathPattern=SearchBar` | ❌ W0 | ⬜ pending |
| 8-02-02 | 02 | 1 | HIST-02 | integration | `npm test -- --testPathPattern=HistoryPage` | ❌ W0 | ⬜ pending |
| 8-03-01 | 03 | 2 | COMP-01 | integration | `npm test -- --testPathPattern=ComparePanel` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/search/fts5.test.ts` — stubs for HIST-01 FTS5 index and search endpoint
- [ ] `src/__tests__/sessions/history.test.ts` — stubs for HIST-02 session list and summary endpoint
- [ ] `src/__tests__/compare/ComparePanel.test.tsx` — stubs for COMP-01 side-by-side comparison

*Existing jest infrastructure covers the framework — Wave 0 only adds test stubs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Search returns results within 2 seconds for 50+ sessions | HIST-01 | Performance SLA requires real data volume | Seed 50+ sessions, run search query, measure response time |
| Read-only mode disables edit controls in MemoryPanel | HIST-02 | Requires full app render in history mode | Open past session, verify no edit/delete buttons visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
