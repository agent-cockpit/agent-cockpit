---
phase: 04-codex-adapter
plan: 02
subsystem: testing, adapter
tags: [codex, jsonl, parser, risk-classifier, tdd, vitest]

# Dependency graph
requires:
  - phase: 04-codex-adapter
    plan: 01
    provides: failing test stubs (8 it.todo), fixture JSONL strings
  - phase: 02-claude-adapter-approval-foundation
    provides: NormalizedEvent types, hookParser.ts pattern reference
  - phase: 01-daemon-core
    provides: vitest infrastructure
provides:
  - codexParser.ts: parseCodexLine pure function mapping Codex JSONL → NormalizedEvent | null
  - codexRiskClassifier.ts: classifyCodexApproval returning actionType + riskLevel for approval events
  - _codexServerId side-channel on approval_request events for adapter correlation
affects: [04-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Codex JSONL parsing via switch on msg.method with typed CodexParserContext mutation
    - Side-channel field prefix convention: _codexServerId with _ prefix signals non-schema adapter field
    - HIGH_RISK_COMMANDS Set for O(1) token-level risk scoring in shell command approval

key-files:
  created:
    - packages/daemon/src/adapters/codex/codexParser.ts
    - packages/daemon/src/adapters/codex/codexRiskClassifier.ts
  modified:
    - packages/daemon/src/adapters/codex/__tests__/codexParser.test.ts

key-decisions:
  - "_codexServerId attached directly on the returned NormalizedEvent object (prefixed _ to signal non-schema field) — adapter reads it to correlate Codex requestApproval id with pending approval Map"
  - "classifyCodexApproval uses a Set of HIGH_RISK_COMMANDS tokens (rm, sudo, chmod, chown, kill, pkill, curl, wget) — each token in the command array is checked individually, not via regex"
  - "CodexParserContext is mutated by parseCodexLine (sessionStartEmitted flag) — caller owns context lifetime, parser side-effects are intentional and documented"

patterns-established:
  - "Codex approval events return _codexServerId side-channel: adapter reads msg.id (any string/number Codex sends) and attaches it untyped to the NormalizedEvent for downstream correlation"
  - "item/started with unknown item.type returns null — unknown extension points are silently ignored"

requirements-completed: [DAEMON-05]

# Metrics
duration: 5min
completed: 2026-04-06
---

# Phase 4 Plan 02: Codex JSONL Parser + Risk Classifier Summary

**Pure-function codexParser.ts + codexRiskClassifier.ts implemented TDD-style: 11 tests GREEN covering all 8 JSONL method mappings and 3 classifier cases**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-06T13:08:41Z
- **Completed:** 2026-04-06T13:13:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Expanded 8 `it.todo` stubs to full `expect` assertions with inline fixture JSONL strings and a fresh `CodexParserContext` per test
- Created `codexRiskClassifier.ts` as a pure function with a `HIGH_RISK_COMMANDS` Set covering destructive/privilege-escalating tokens
- Created `codexParser.ts` exporting `parseCodexLine` + `CodexParserContext`; switch on `msg.method` covers all 6 mapped cases plus malformed JSON catch
- All 11 codexParser tests pass; 67 pre-existing daemon tests remain green; codexAdapter stubs remain RED (expected — Plan 03)

## Task Commits

Each task was committed atomically:

1. **Task 1: Expand test stubs + implement codexRiskClassifier.ts** - `2aed864` (test)
2. **Task 2: Implement codexParser.ts to GREEN** - `4166745` (feat)

**Plan metadata:** (docs commit below)

_Note: TDD — Task 1 is RED commit (tests + classifier), Task 2 is GREEN commit (parser implementation)_

## Files Created/Modified
- `packages/daemon/src/adapters/codex/__tests__/codexParser.test.ts` - Expanded 8 todos to full assertions + added 3 classifier tests
- `packages/daemon/src/adapters/codex/codexRiskClassifier.ts` - Pure risk classifier, HIGH_RISK_COMMANDS Set, fileChange always medium
- `packages/daemon/src/adapters/codex/codexParser.ts` - parseCodexLine implementation: 6 method cases + malformed JSON guard

## Decisions Made
- `_codexServerId` attached directly on the `NormalizedEvent` return object with `_` prefix to signal non-schema field — Plan 03 adapter reads `msg.id` from this field to map Codex approval reply IDs
- `classifyCodexApproval` checks each command token individually against a `Set` rather than using regex — simpler and O(1) per token
- `CodexParserContext` is mutated by `parseCodexLine` (`sessionStartEmitted = true`) — caller owns context lifetime; mutation is intentional and documented via the interface definition

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 03 (CodexAdapter class) can now import and use `parseCodexLine` + `CodexParserContext` directly
- `_codexServerId` side-channel is ready for adapter to store in `pendingCodexApprovals` Map
- codexAdapter.test.ts stubs remain RED (Cannot find module '../codexAdapter.js') — this is the expected Wave 0 stub state

---
*Phase: 04-codex-adapter*
*Completed: 2026-04-06*

## Self-Check: PASSED
- packages/daemon/src/adapters/codex/codexParser.ts: FOUND
- packages/daemon/src/adapters/codex/codexRiskClassifier.ts: FOUND
- packages/daemon/src/adapters/codex/__tests__/codexParser.test.ts: FOUND (modified)
- Commit 2aed864: FOUND
- Commit 4166745: FOUND
