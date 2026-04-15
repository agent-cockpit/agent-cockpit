# Deferred Items — Phase 16

## Pre-existing Test Failures (out of scope)

These failures existed before Plan 16-01 and are unrelated to player controls:

1. `src/__tests__/eventsSlice.test.ts` — "skips an event whose sequenceNumber is already present"
   - Uses `toBe` (reference equality) where `toStrictEqual` is needed
2. `src/__tests__/approvalsSlice.test.ts` — "returns state unchanged on unrelated event type"
   - Same issue: `toBe` vs `toStrictEqual` for value comparison
3. `src/__tests__/ApprovalInbox.test.tsx` — "shows risk level badge"
   - UI element not found, likely a pre-existing UI regression

**Action needed:** Fix object-identity assertions in slices and verify ApprovalInbox UI rendering.
