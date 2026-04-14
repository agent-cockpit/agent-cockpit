# Deferred Items

## 2026-04-14

- `pnpm --filter @cockpit/ui test -- CharacterPicker` still executes unrelated package tests that already fail outside this plan, including `src/__tests__/eventsSlice.test.ts`, `src/__tests__/approvalsSlice.test.ts`, `src/__tests__/uiSlice.test.ts`, `src/__tests__/AgentHoverCard.test.tsx`, and `src/__tests__/DiffPanel.test.tsx`. The new `CharacterPicker` component itself passes in isolation via `pnpm --filter @cockpit/ui exec vitest run src/components/sessions/__tests__/CharacterPicker.test.tsx`.
