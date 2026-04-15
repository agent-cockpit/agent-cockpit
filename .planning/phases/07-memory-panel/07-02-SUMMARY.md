---
phase: 07-memory-panel
plan: 02
subsystem: daemon
tags: [rest-api, memory, notes, suggestions, tdd]
dependency_graph:
  requires: [07-01]
  provides: [/api/memory/* REST endpoints, getWorkspacePath helper, pendingSuggestions Map]
  affects: [packages/daemon/src/ws/server.ts, packages/daemon/src/memory/memoryReader.ts]
tech_stack:
  added: []
  patterns:
    - "most-specific-first route matching in HTTP request handler"
    - "optional db param on broadcast() for side-effect registration"
    - "pendingSuggestions module-scope Map populated on broadcast"
key_files:
  created:
    - packages/daemon/src/__tests__/memory-endpoints.test.ts
  modified:
    - packages/daemon/src/memory/memoryReader.ts
    - packages/daemon/src/ws/server.ts
    - packages/daemon/src/index.ts
decisions:
  - "broadcast() receives optional db param — avoids signature breakage while enabling side-effect Map population for suggestions"
  - "pendingSuggestions Map at module scope in server.ts — survives across requests within process lifetime"
  - "suggestRejectMatch regex matches /notes/:id but suggestions regex placed before notes regex — DELETE /api/memory/suggestions/:id does not conflict with DELETE /api/memory/notes/:noteId due to path specificity"
metrics:
  duration: "5 min"
  completed_date: "2026-04-07"
  tasks_completed: 2
  files_modified: 4
---

# Phase 7 Plan 2: Memory REST Endpoints Summary

**One-liner:** All eight /api/memory/* REST endpoints implemented in server.ts — CLAUDE.md read/write, auto-memory read, notes CRUD, and suggestions approve (real disk write) / reject — backed by getWorkspacePath helper in memoryReader.ts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | getWorkspacePath helper + CLAUDE.md and auto-memory endpoints | daf3847 | memoryReader.ts, server.ts, memory-endpoints.test.ts |
| 2 | Notes CRUD + suggestions approve (disk write) + reject | 2796cb1 | server.ts, index.ts, memory-endpoints.test.ts |

## What Was Built

### Task 1

- Added `getWorkspacePath(db, sessionId)` to `memoryReader.ts` — queries `events` table for `session_start` payload, parses `workspacePath` field.
- Extended CORS `Access-Control-Allow-Methods` header from `GET, POST, OPTIONS` to `GET, POST, PUT, DELETE, OPTIONS`.
- Imported `resolveClaudeMdPath`, `resolveAutoMemoryPath`, `readFileSafe`, `writeFileSafe`, `getWorkspacePath` from memoryReader and `insertNote`, `listNotes`, `deleteNote` from memoryNotes into server.ts.
- Registered three new handlers before the existing `eventsMatch` check:
  - `GET /api/memory/:sessionId/claude-md` — returns `{content, path}` or `{content: null, path: null}` when absent
  - `PUT /api/memory/:sessionId/claude-md` — reads body `{content}`, writes to disk, returns `{ok: true}`
  - `GET /api/memory/:sessionId/auto-memory` — returns `{content}` (null when MEMORY.md absent)
- All three return 404 when sessionId not found in events table.

### Task 2

- Declared `pendingSuggestions = new Map<string, {workspace, value}>()` at module scope.
- Added optional `db` parameter to `broadcast()` — when provided, parses payload JSON and populates `pendingSuggestions` when `type === 'memory_write' && suggested === true`.
- Updated `index.ts` to pass `db` to `broadcast()` call.
- Registered five new handlers (after auto-memory, before the 404 fallthrough):
  - `POST /api/memory/suggestions/:id/approve` — looks up pending suggestion, reads existing MEMORY.md, appends value, writes to disk, removes from Map; returns 404 if suggestion not in Map
  - `DELETE /api/memory/suggestions/:id` — removes from Map, returns `{ok: true}`
  - `DELETE /api/memory/notes/:noteId` — registered before GET notes (specificity)
  - `GET /api/memory/notes?workspace=X` — returns `MemoryNote[]` for workspace
  - `POST /api/memory/notes` — inserts note, returns `MemoryNote` with 201

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Optional `db` param on `broadcast()` | Preserves existing call sites (ws-catchup tests) without requiring changes; index.ts passes db, tests calling broadcast without db still work |
| `pendingSuggestions` at module scope | Matches plan spec; survives across requests within process lifetime; cleared by delete on approve/reject |
| DELETE suggestions regex placed before DELETE notes regex | `/suggestions/` prefix is more specific, preventing routing conflicts with `/notes/` pattern |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test for PUT claude-md incorrectly read from wrong path**
- **Found during:** Task 1 GREEN phase
- **Issue:** Test read from `workspace/CLAUDE.md` directly, but `resolveClaudeMdPath` returns `.claude/CLAUDE.md` when no primary file exists — causing ENOENT on test assertion
- **Fix:** Pre-created `CLAUDE.md` in workspace root so `resolveClaudeMdPath` returns primary path; test reads from same pre-created path
- **Files modified:** `memory-endpoints.test.ts`
- **Commit:** daf3847 (part of Task 1 commit)

## Self-Check: PASSED

Files verified to exist:
- packages/daemon/src/memory/memoryReader.ts — FOUND
- packages/daemon/src/ws/server.ts — FOUND
- packages/daemon/src/index.ts — FOUND
- packages/daemon/src/__tests__/memory-endpoints.test.ts — FOUND

Commits verified:
- daf3847 — FOUND
- 2796cb1 — FOUND

Test results: 192 passed, 10 todo, 0 failed across 22 test files + 1 skipped.
