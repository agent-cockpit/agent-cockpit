# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04)

**Core value:** One unified approval, memory, and replay layer across Claude Code and Codex — so developers can run agents productively, not just watch them.
**Current focus:** Phase 1 — Daemon Core

## Current Position

Phase: 1 of 9 (Daemon Core)
Plan: 1 of 3 in current phase
Status: In progress
Last activity: 2026-04-05 — Plan 01-01 complete: pnpm monorepo scaffold and @cockpit/shared NormalizedEvent Zod schema

Progress: [█░░░░░░░░░] 4% (1/27 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 2 min
- Total execution time: 0.03 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-daemon-core | 1 | 2 min | 2 min |

**Recent Trend:**
- Last 5 plans: 2 min
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Daemon-first order is dictated by the feature dependency tree — every UI feature requires the local daemon
- Roadmap: Approval timeout logic ships in Phase 2 with the first approval implementation, not as a follow-up
- Roadmap: Office mode is Phase 9 (last) — additive display layer on proven Zustand store, no data model dependencies
- Roadmap: Codex adapter is Phase 4 (after browser UI shell) — isolated adapter boundary avoids contaminating core architecture validation
- 01-01: Package exports point to ./src/index.ts — no build step required in workspace development
- 01-01: NodeNext moduleResolution used throughout — requires .js extensions in TypeScript source imports
- 01-01: sequenceNumber is optional on NormalizedEvent — adapters omit it, SQLite assigns on insert
- 01-01: vitest.config.ts uses 'projects' field (not deprecated vitest.workspace.ts) per Vitest 3.2+ convention

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 2 planning: Claude Code hook configuration schema (`~/.claude/settings.json`) and PermissionRequest hook response envelope need verification against current Claude Code version before planning
- Phase 4 planning: Codex app-server initialization handshake sequence may have changed in recent CLI versions — capture fixture files at planning time
- Phase 7 planning: CLAUDE.md auto-memory format and agent-suggested memory hook event names need confirmation before planning

## Session Continuity

Last session: 2026-04-05
Stopped at: Completed 01-daemon-core/01-01-PLAN.md — monorepo scaffold and @cockpit/shared NormalizedEvent schema
Resume file: None
