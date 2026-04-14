# Deferred Items — Phase 26

## Pre-existing test failures (out of scope for 26-02)

### OpsLayout.test.tsx — window.matchMedia not mocked

**File:** `packages/ui/src/__tests__/OpsLayout.test.tsx`
**Error:** `TypeError: window.matchMedia is not a function` at `OpsLayout.tsx:43`
**Root cause:** Phase 16.8 added a `matchMedia(DESKTOP_MEDIA_QUERY)` call inside a `useState` initializer for the sidebar resize handle. The OpsLayout test does not stub `window.matchMedia`, causing all 5 OpsLayout tests to fail.
**Impact:** None on MapSidebar or FaceAvatar functionality — purely a test environment setup gap.
**Fix needed:** Add `window.matchMedia = vi.fn().mockReturnValue({ matches: true })` to OpsLayout.test.tsx setup.
