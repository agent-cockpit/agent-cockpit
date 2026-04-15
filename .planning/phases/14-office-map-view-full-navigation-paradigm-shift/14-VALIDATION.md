---
phase: 14
slug: office-map-view-full-navigation-paradigm-shift
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/ui/vitest.config.ts |
| **Quick run command** | `pnpm --filter @agent-cockpit/ui test --run` |
| **Full suite command** | `pnpm --filter @agent-cockpit/ui test --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @agent-cockpit/ui test --run`
- **After every plan wave:** Run `pnpm --filter @agent-cockpit/ui test --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | routing-default | unit | `pnpm --filter @agent-cockpit/ui test --run App` | ✅ | ⬜ pending |
| 14-01-02 | 01 | 1 | panel-sessionid-fallback | unit | `pnpm --filter @agent-cockpit/ui test --run ApprovalInbox` | ✅ | ⬜ pending |
| 14-02-01 | 02 | 2 | popup-hub | unit | `pnpm --filter @agent-cockpit/ui test --run InstancePopupHub` | ❌ W0 | ⬜ pending |
| 14-02-02 | 02 | 2 | sidebar-minimal | unit | `pnpm --filter @agent-cockpit/ui test --run Sidebar` | ✅ | ⬜ pending |
| 14-03-01 | 03 | 3 | history-popup | unit | `pnpm --filter @agent-cockpit/ui test --run HistoryPopup` | ❌ W0 | ⬜ pending |
| 14-03-02 | 03 | 3 | approvals-regression | unit | `pnpm --filter @agent-cockpit/ui test --run ApprovalInbox` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/ui/src/components/office/__tests__/InstancePopupHub.test.tsx` — stub for popup hub component
- [ ] `packages/ui/src/components/office/__tests__/HistoryPopup.test.tsx` — stub for history popup

*Existing vitest infrastructure covers all other phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Camera focuses on instance when clicked in sidebar | sidebar-focus | DOM position/scroll assertions brittle in JSDOM | Click instance in sidebar, verify map scrolls/pans to character position |
| Office map is default landing view | default-route | React Router hydration in JSDOM doesn't match browser | Open app at `/`, verify Office map renders, not HistoryPage |
| Approve/Deny buttons visible in popup and functional | approvals-regression | Requires live WebSocket daemon for full flow | Trigger approval, open popup hub, approve/deny, verify resolution |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
