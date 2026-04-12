# Deferred Items — Phase 16.5-walking-animation-rework

## Pre-existing Test Failures (out-of-scope, found during 16.5-02 Task 1 verification)

### approvalsSlice.test.ts
- **Issue:** Uses `toBe` for deep equality instead of `toStrictEqual` — Object.is equality fails for structurally equal objects
- **Test:** "applyEventToEvents skips an event whose sequenceNumber is already present (dedup guard)"
- **Fix needed:** Change `toBe` to `toStrictEqual` on assertion line 110

### eventsSlice.test.ts
- **Issue:** Same `toBe` vs `toStrictEqual` pattern
- **Test:** Same dedup guard test
- **Fix needed:** Change `toBe` to `toStrictEqual` on assertion line 76

These failures predate Phase 16.5. Not related to animation/sprite code. Should be fixed in a future cleanup phase.
