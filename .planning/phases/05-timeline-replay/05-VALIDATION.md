---
phase: 5
slug: timeline-replay
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npm run test -- --run` |
| **Full suite command** | `npm run test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run`
- **After every plan wave:** Run `npm run test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 1 | TIMELINE-01 | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 5-01-02 | 01 | 1 | TIMELINE-01 | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 5-02-01 | 02 | 1 | TIMELINE-02 | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 5-03-01 | 03 | 2 | TIMELINE-03 | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 5-04-01 | 04 | 2 | TIMELINE-04 | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/ui/store/__tests__/eventsSlice.test.ts` — stubs for TIMELINE-01 (events slice dedup logic)
- [ ] `src/ui/components/__tests__/TimelinePanel.test.tsx` — stubs for TIMELINE-01, TIMELINE-02, TIMELINE-03, TIMELINE-04
- [ ] `src/ui/components/__tests__/TimelineFilters.test.tsx` — stubs for TIMELINE-03
- [ ] `src/ui/components/__tests__/TimelineEventDetail.test.tsx` — stubs for TIMELINE-04

*Existing test infrastructure (vitest) covers all phase requirements — no new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Jump-to-event scrolls correct position | TIMELINE-02 | DOM scroll position not testable in jsdom | Open session, click jump button, verify scroll position in browser |
| Filter clears and scrolls to target | TIMELINE-02 | Browser visual verification needed | Apply filter, click jump, verify filter cleared and scroll happened |
| Inline detail renders correct diff | TIMELINE-04 | Requires real file diff rendering | Click file-change event, verify diff renders correctly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
