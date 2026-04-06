# Deferred Items — Phase 04-codex-adapter

## Pre-existing TypeScript Errors (out of scope for 04-03)

These errors existed before Plan 04-03 execution and are in files not modified by this plan:

1. `src/__tests__/hook-server.test.ts:55` — Type mismatch on `HookPayload` vs `Record<string, unknown>`
2. `src/__tests__/hook-server.test.ts:65` — Property 'provider' does not exist on union type
3. `src/__tests__/ws-catchup.test.ts:50` — Namespace 'Database' has no exported member 'default'
4. `src/eventBus.ts:12` — Overload signature not compatible with implementation

All modified files (approvalQueue.ts, ws/server.ts, codexAdapter.ts) typecheck cleanly.
These pre-existing errors should be addressed in a separate maintenance plan.
