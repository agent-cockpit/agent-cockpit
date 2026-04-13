# Deferred Items

## 2026-04-13

Out-of-scope failures discovered while running `cd packages/ui && npx vitest run` after Task 3:

- `src/__tests__/OpsLayout.test.tsx`: `window.matchMedia is not a function`
- `src/pages/__tests__/OfficePage.test.tsx`: `setSessionDetailOpen is not a function`
- `src/__tests__/AgentHoverCard.test.tsx`: pending-approvals assertions failing
- `src/__tests__/ApprovalInbox.test.tsx`: expected empty/risk-level UI text assertions failing
- `src/__tests__/DiffPanel.test.tsx`: expected legacy diff summary/color classes failing
- `src/__tests__/HistoryPage.test.tsx`: session row navigation assertion mismatch
- `src/__tests__/approvalsSlice.test.ts`: identity assertion mismatch (`toBe` object reference)
- `src/__tests__/eventsSlice.test.ts`: identity assertion mismatch (`toBe` object reference)

These test failures are outside Plan `16.9-01` file scope and were not modified in this execution.

Out-of-scope failure discovered while completing Plan `16.9-02`:

- `src/components/layout/__tests__/MapSidebar.test.tsx`: unhandled exception `TypeError: setSessionDetailOpen is not a function` during full-suite run (`cd packages/ui && npx vitest run`)

This failure is outside Plan `16.9-02` file scope and was not modified in this execution.
