---
phase: 24
slug: agent-avatar-chat-popup-interaction
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 24 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm --filter @cockpit/ui test --run OfficePage && pnpm --filter @cockpit/ui test --run InstancePopupHub` |
| **Full suite command** | `pnpm --filter @cockpit/ui test` |
| **Estimated runtime** | ~90 seconds |

## Sampling Rate

- **After each task:** quick run command
- **After wave:** full suite command
- **Before verify-work:** full suite green
- **Max feedback latency:** 90 seconds

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | POPUP-CHAT-01 | integration | `pnpm --filter @cockpit/ui test --run OfficePage` | ✅ | ⬜ pending |
| 24-01-02 | 01 | 1 | POPUP-CHAT-02 | component | `pnpm --filter @cockpit/ui test --run InstancePopupHub` | ✅ | ⬜ pending |
| 24-01-03 | 01 | 1 | POPUP-CHAT-02 | regression | `pnpm --filter @cockpit/ui test --run SessionListPanel` | ✅ | ⬜ pending |

## Wave 0 Requirements

- [ ] `packages/ui/src/pages/__tests__/OfficePage.popup-chat.test.tsx`

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Perceived interaction responsiveness | POPUP-CHAT-01 | UX timing | Click multiple sprites quickly and verify popup keeps correct session and chat context |

## Validation Sign-Off

- [ ] Task verification complete
- [ ] Regression checks pass
- [ ] `nyquist_compliant: true` set when accepted

**Approval:** pending
