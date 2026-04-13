# Deferred Items

## 16.8-02 Task 3 Regression Check

- `pnpm --filter @cockpit/ui test --run src/components/layout/__tests__/MapSidebar.test.tsx src/components/layout/__tests__/OpsLayout.test.tsx`
  fails in `src/components/layout/__tests__/OpsLayout.test.tsx` (4 failures) because the untracked test expects resizable-sidebar behavior (`data-testid="ops-sidebar"`, resize handle role `separator`) that is not present in current `OpsLayout.tsx`.
- `pnpm --filter @cockpit/ui typecheck` fails with pre-existing non-sidebar errors:
  - `src/components/office/__tests__/ApprovalInboxPopup.test.tsx(56,3): TS2304 Cannot find name 'beforeEach'`
  - `src/components/office/AgentSprite.tsx(39,9): TS2741 Property 'walk' is missing in STATE_ROW_OFFSET`
  - `src/setupTests.ts(5,1): TS2322 getContext mock signature mismatch`
