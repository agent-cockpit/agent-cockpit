---
phase: 08-session-history-search
plan: "01"
subsystem: daemon/db
tags: [fts5, sqlite, search, session-history, queries]
dependency_graph:
  requires: []
  provides: [search_fts-virtual-table, indexForSearch, searchAll, getAllSessions, getSessionSummary]
  affects: [packages/daemon/src/db/database.ts, packages/daemon/src/db/queries.ts]
tech_stack:
  added: []
  patterns: [FTS5 virtual table with external content, idempotent backfill migration, BM25 ranked search with snippet()]
key_files:
  created:
    - packages/daemon/src/__tests__/search.test.ts
    - packages/daemon/src/__tests__/history-endpoints.test.ts
  modified:
    - packages/daemon/src/db/database.ts
    - packages/daemon/src/db/queries.ts
decisions:
  - "FTS5 table uses content='' (external content) with manual INSERT — avoids full-table scan on query vs content=tableName approach"
  - "Backfill uses INSERT OR IGNORE with explicit rowid from source tables — idempotent on repeated openDatabase() calls"
  - "searchAll wraps user query in double-quotes and escapes internal double-quotes — forces phrase query, prevents FTS5 syntax injection"
  - "persistEvent extracts specific text fields (type, proposedAction, filePath, toolName, workspacePath, memoryKey, value) rather than indexing full JSON blob — keeps FTS5 index focused"
  - "getAllSessions derives sessions from session_start events via JSON_EXTRACT — events table is source of truth, no separate sessions table"
metrics:
  duration: "2min"
  completed_date: "2026-04-07"
  tasks_completed: 2
  files_modified: 4
requirements:
  - HIST-01
  - HIST-02
  - COMP-01
---

# Phase 8 Plan 1: FTS5 Search Infrastructure + Session Query Functions Summary

**One-liner:** SQLite FTS5 virtual table with unicode61 tokenizer, idempotent backfill migration, and four new query exports (indexForSearch, searchAll, getAllSessions, getSessionSummary) wired into persistEvent for live indexing.

## What Was Built

### database.ts — FTS5 virtual table + backfill migration

Added a `search_fts` virtual table to the `db.exec()` schema block in `openDatabase()`:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  content,
  source_type UNINDEXED,
  session_id UNINDEXED,
  source_id UNINDEXED,
  tokenize='unicode61'
);
```

Followed by a one-time idempotent backfill that runs on every `openDatabase()` call using `INSERT OR IGNORE` with explicit rowids from each source table (events, approvals, memory_notes). This ensures pre-Phase-8 session data is indexed on first startup.

### queries.ts — four new exports + persistEvent integration

**New interfaces:**
- `SearchResult { sourceType, sourceId, sessionId, snippet }`
- `SessionSummary { sessionId, provider, workspacePath, startedAt, endedAt, approvalCount, filesChanged, finalStatus }`

**New functions:**
- `indexForSearch(db, text, sourceType, sourceId, sessionId)` — inserts into search_fts
- `searchAll(db, query)` — FTS5 MATCH with BM25 ranking, snippet extraction, injection-safe query wrapping
- `getAllSessions(db)` — derives sessions from session_start events with SQL subqueries for approvalCount and filesChanged
- `getSessionSummary(db, sessionId)` — single-session variant returning null for unknown IDs

**persistEvent integration:** After each event insert, `persistEvent()` now extracts searchable text fields and calls `indexForSearch()` so every live event is indexed as it arrives.

### Test files

- `search.test.ts` — 3 tests: FTS5 table creation, index+search round-trip, backfill idempotency
- `history-endpoints.test.ts` — 8 tests covering all query functions + injection safety + empty states

## Verification

```
Test Files  13 passed (13)
Tests  122 passed (122)
```

All 122 daemon tests pass including the 11 new tests added in this plan.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All files found. All commits verified: 66d9fdd (Task 1), fd364d2 (Task 2).
