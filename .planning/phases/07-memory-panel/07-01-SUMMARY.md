---
phase: 07-memory-panel
plan: "01"
subsystem: memory
tags: [sqlite, file-io, tdd, wave-0]
dependency_graph:
  requires: []
  provides:
    - memory_notes SQLite table
    - memoryReader.ts file I/O helpers
    - memoryNotes.ts CRUD helpers
    - memory-reader and memory-notes unit tests (GREEN)
    - MemoryPanel.test.tsx todo stubs (pending)
  affects:
    - packages/daemon/src/db/database.ts
tech_stack:
  added: []
  patterns:
    - better-sqlite3 synchronous CRUD with parameterised prepared statements
    - node:fs synchronous file I/O with ENOENT catch-all null return
    - vitest it.todo() stubs for Wave 1 contract tests
key_files:
  created:
    - packages/daemon/src/memory/memoryReader.ts
    - packages/daemon/src/memory/memoryNotes.ts
    - packages/daemon/src/__tests__/memory-reader.test.ts
    - packages/daemon/src/__tests__/memory-notes.test.ts
    - packages/ui/src/__tests__/MemoryPanel.test.tsx
  modified:
    - packages/daemon/src/db/database.ts
decisions:
  - "memory_notes table placed after codex_sessions in schema block — preserves append-only ordering and matches research spec"
  - "readFileSafe uses bare catch (not ENOENT check) — covers ENOENT and EACCES both returning null per behavior spec"
  - "MemoryPanel.test.tsx uses it.todo() only (no failing imports) — stub component already exists at panels/MemoryPanel.tsx"
metrics:
  duration: 2min
  completed: "2026-04-07"
  tasks: 2
  files: 6
---

# Phase 7 Plan 01: Memory Foundation — Schema, File I/O, CRUD, Test Stubs Summary

Wave 0 foundation: `memory_notes` SQLite table with index, `memoryReader.ts` file-I/O helpers, `memoryNotes.ts` CRUD module, unit tests for both daemon modules passing GREEN, and 10 `it.todo` stubs in `MemoryPanel.test.tsx` covering MEM-01..04 behaviors.

## What Was Built

**Schema addition (`database.ts`):** `memory_notes` table with `note_id TEXT PRIMARY KEY`, `workspace TEXT`, `content TEXT`, `pinned INTEGER DEFAULT 1`, `created_at TEXT`, plus `idx_memory_notes_workspace` covering index for workspace lookups.

**`memoryReader.ts`:** Four exports — `resolveClaudeMdPath` (primary vs `.claude/` fallback), `resolveAutoMemoryPath` (encodes workspace path to `~/.claude/projects/<encoded>/memory/MEMORY.md`), `readFileSafe` (returns `null` on any error), `writeFileSafe` (creates parent dirs then writes atomically).

**`memoryNotes.ts`:** Three exports — `insertNote` (auto-generates `noteId` via `crypto.randomUUID()` and `createdAt` if not provided), `listNotes` (ordered `created_at DESC`), `deleteNote` (no-op if not found).

**Test files:**
- `memory-reader.test.ts` — 5 tests, GREEN: primary/fallback path resolution, readFileSafe on existing and missing files, writeFileSafe creating nested dirs
- `memory-notes.test.ts` — 7 tests, GREEN: insert/list round-trip, provided IDs, pinned=0, DESC ordering, empty for unknown workspace, delete, delete no-op
- `MemoryPanel.test.tsx` — 10 `it.todo()` stubs, shown as "pending/skipped" in vitest output, zero failures

## Test Results

- Before: 19 files, 162 tests passing
- After: 22 files, 174 tests passing, 10 todo (MemoryPanel stubs)
- No regressions

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files created/modified
- [x] packages/daemon/src/memory/memoryReader.ts — FOUND
- [x] packages/daemon/src/memory/memoryNotes.ts — FOUND
- [x] packages/daemon/src/db/database.ts — modified FOUND
- [x] packages/daemon/src/__tests__/memory-reader.test.ts — FOUND
- [x] packages/daemon/src/__tests__/memory-notes.test.ts — FOUND
- [x] packages/ui/src/__tests__/MemoryPanel.test.tsx — FOUND

### Commits
- 8f020d8: feat(07-01): memory_notes DB schema + memoryReader + memoryNotes modules
- bd13539: test(07-01): write test files — memory-reader, memory-notes unit tests + MemoryPanel stubs

## Self-Check: PASSED
