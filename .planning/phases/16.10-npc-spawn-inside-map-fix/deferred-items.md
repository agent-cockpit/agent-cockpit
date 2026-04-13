# Deferred Items

## 2026-04-13

- Out-of-scope test-suite instability in `packages/ui`: `npx vitest run` reports failures in `src/components/layout/__tests__/MapSidebar.test.tsx` ("clicking a row selects session and focuses it on the map") plus additional unrelated failures. This plan only modifies NPC spawn seeding in `OfficePage.tsx`; targeted `OfficePage.test.tsx` passes GREEN after implementation.
