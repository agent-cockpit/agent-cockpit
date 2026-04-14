---
phase: 24-agent-avatar-chat-popup-interaction
verified: 2026-04-14T21:47:09Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 24: Agent Avatar Chat Popup Interaction Verification Report

**Phase Goal:** Make agent avatar interaction deterministic and chat-centric: clicking an agent sprite always opens the popup for that session and lands the user in the Chat tab with the correct session context.
**Verified:** 2026-04-14T21:47:09Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Clicking any on-map agent opens `InstancePopupHub` for that exact session | VERIFIED | `OfficePage` click handler hit-tests NPC sprite bounds, calls `selectSession(sessionId)`, and opens popup via `setSessionDetailOpen(true)` (`packages/ui/src/pages/OfficePage.tsx`) |
| 2 | Popup defaults to the Chat tab when opened from avatar interaction | VERIFIED | Avatar click sets `setPopupPreferredTab('chat')` before opening; popup consumes this one-shot preference and sets active tab (`packages/ui/src/pages/OfficePage.tsx`, `packages/ui/src/components/office/InstancePopupHub.tsx`) |
| 3 | Selected session state stays consistent between map, sidebar, and popup while switching agents | VERIFIED | Session routing remains store-driven (`selectedSessionId`), and avatar click now updates session + popup intent atomically; tests assert selected session and popup-open flow (`packages/ui/src/pages/__tests__/OfficePage.test.tsx`, `packages/ui/src/__tests__/OfficePage.test.tsx`) |
| 4 | Missed-click and hit-test edge cases are covered by tests | VERIFIED | Existing OfficePage tests still cover outside-sprite clicks and camera/session behavior; all OfficePage suites pass (`vitest --run OfficePage`) |
| 5 | No regression to approvals/timeline/diff/memory/artifacts tabs | VERIFIED | Non-avatar default remains Approvals, and popup one-shot preference resets after use; regression tests cover non-avatar defaults (`packages/ui/src/components/office/__tests__/InstancePopupHub.test.tsx`, `packages/ui/src/__tests__/SessionListPanel.test.tsx`) |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/ui/src/store/index.ts` | Store-level popup tab preference model | VERIFIED | Added `PopupTabId`, `popupPreferredTab`, and `setPopupPreferredTab` |
| `packages/ui/src/pages/OfficePage.tsx` | Avatar click path opens chat-first popup for clicked session | VERIFIED | Click flow now sets chat preference before opening popup |
| `packages/ui/src/components/office/InstancePopupHub.tsx` | Popup consumes preference, applies tab, and resets intent | VERIFIED | Controlled `Tabs.Root` with one-shot preference handling + approvals fallback |
| `packages/ui/src/pages/__tests__/OfficePage.test.tsx` | Avatar click regression coverage in page-level suite | VERIFIED | Asserts `setPopupPreferredTab('chat')` and popup open call |
| `packages/ui/src/components/office/__tests__/InstancePopupHub.test.tsx` | Popup tab behavior regression coverage | VERIFIED | Covers chat preference, one-shot consumption, and approvals default |
| `packages/ui/src/__tests__/SessionListPanel.test.tsx` | Non-avatar path remains unchanged | VERIFIED | Added assertion that session-card click does not set popup chat preference |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| POPUP-CHAT-01 | 24-01-PLAN.md | Avatar click opens popup on exact clicked session | SATISFIED | `OfficePage` click handler + OfficePage tests |
| POPUP-CHAT-02 | 24-01-PLAN.md | Avatar-opened popup defaults to Chat while preserving other entry behavior | SATISFIED | `popupPreferredTab` one-shot pattern in store/popup + regression tests |

**Note on requirement IDs:** `POPUP-CHAT-01` and `POPUP-CHAT-02` are phase-local IDs in ROADMAP/plan frontmatter and are not listed in global `REQUIREMENTS.md`, consistent with recent technical phases.

### Automated Verification Runs (Executed)

Commands run:
- `pnpm --filter @cockpit/ui test --run OfficePage`
- `pnpm --filter @cockpit/ui test --run InstancePopupHub`
- `pnpm --filter @cockpit/ui test --run SessionListPanel`

Outcome:
- All commands passed on 2026-04-14.
- Known jsdom warning noise remains in OfficePage tests (`/maps/maps-manifest.json` URL parsing in fetch paths), but assertions pass and this behavior predates this phase.

### Human Verification Required

None. This phase goal is fully validated by deterministic unit/integration tests across avatar, popup, and session-list flows.

### Gaps Summary

No gaps found. Phase goal and all plan must-haves are satisfied.

---

_Verified: 2026-04-14T21:47:09Z_
_Verifier: Codex_
