---
phase: 27
slug: player-character-selection
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
| **Config file** | `packages/ui/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @cockpit/ui test -- CharacterPicker MenuPopup OfficePage uiSlice` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run the narrowest relevant UI test target
- **After every plan wave:** Run `pnpm --filter @cockpit/ui test -- CharacterPicker MenuPopup OfficePage uiSlice`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | character-selection | unit | `pnpm --filter @cockpit/ui test -- uiSlice` | ✅ extend existing | ⬜ pending |
| 27-01-02 | 01 | 1 | character-selection | unit | `pnpm --filter @cockpit/ui test -- uiSlice` | ✅ extend existing | ⬜ pending |
| 27-02-01 | 02 | 1 | character-selection | component | `pnpm --filter @cockpit/ui test -- CharacterPicker` | ❌ new | ⬜ pending |
| 27-02-02 | 02 | 1 | character-selection | component | `pnpm --filter @cockpit/ui test -- CharacterPicker` | ❌ new | ⬜ pending |
| 27-03-01 | 03 | 2 | character-selection | component | `pnpm --filter @cockpit/ui test -- MenuPopup` | ✅ extend existing | ⬜ pending |
| 27-03-02 | 03 | 2 | character-selection | component | `pnpm --filter @cockpit/ui test -- OfficePage` | ✅ extend existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure is sufficient; only one new test file is required.

- `packages/ui/src/components/sessions/__tests__/CharacterPicker.test.tsx` — picker render, wrap-around, confirm behavior
- `packages/ui/src/__tests__/uiSlice.test.ts` — extend for persisted player character coverage
- `packages/ui/src/components/office/__tests__/MenuPopup.test.tsx` — extend for menu wiring
- `packages/ui/src/pages/__tests__/OfficePage.test.tsx` — extend for state-driven sprite source

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Picker looks correct in the menu and remains readable | character-selection | Final UI polish is visual | Open Office view, click `Menu`, confirm the picker shows portrait, name, arrows, and confirm button without breaking audio controls |
| Confirm updates the on-map player sprite immediately | character-selection | Final visual sprite swap is easier to validate live | Open menu, pick a non-astronaut character, click confirm, verify the player sprite changes at once |
| Selection survives page reload | character-selection | End-to-end browser persistence check | Select a character, reload the page, verify the same character is still active |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all missing test surfaces
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
