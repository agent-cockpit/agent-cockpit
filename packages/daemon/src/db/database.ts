import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';

export function openDatabase(dbPath: string): Database.Database {
  // Ensure parent directory exists (skip for :memory:)
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);

  // WAL mode — assert the return value per research pitfall #2
  // Note: :memory: databases always return 'memory', WAL only applies to file DBs
  const mode = db.pragma('journal_mode = WAL', { simple: true }) as string;
  if (dbPath !== ':memory:' && mode !== 'wal') {
    throw new Error(`Failed to enable WAL mode; got: ${mode}`);
  }

  // Recommended production settings
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Schema (idempotent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      sequence_number INTEGER PRIMARY KEY,
      session_id      TEXT NOT NULL,
      type            TEXT NOT NULL,
      schema_version  INTEGER NOT NULL DEFAULT 1,
      payload         TEXT NOT NULL,
      timestamp       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_session
      ON events (session_id, sequence_number);
    CREATE INDEX IF NOT EXISTS idx_events_session_type_timestamp
      ON events (session_id, type, timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_type_session
      ON events (type, session_id);

    CREATE TABLE IF NOT EXISTS approvals (
      approval_id      TEXT PRIMARY KEY,
      session_id       TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'pending',
      action_type      TEXT NOT NULL,
      risk_level       TEXT NOT NULL,
      proposed_action  TEXT NOT NULL,
      affected_paths   TEXT,
      why_risky        TEXT,
      created_at       TEXT NOT NULL,
      decided_at       TEXT,
      decision_reason  TEXT
    );

    CREATE TABLE IF NOT EXISTS always_allow_rules (
      id          INTEGER PRIMARY KEY,
      session_id  TEXT NOT NULL,
      tool_name   TEXT NOT NULL,
      pattern     TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS codex_sessions (
      session_id   TEXT PRIMARY KEY,
      thread_id    TEXT NOT NULL,
      workspace    TEXT NOT NULL,
      created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_notes (
      note_id    TEXT PRIMARY KEY,
      workspace  TEXT NOT NULL,
      content    TEXT NOT NULL,
      pinned     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memory_notes_workspace
      ON memory_notes (workspace);

    CREATE TABLE IF NOT EXISTS claude_sessions (
      session_id   TEXT PRIMARY KEY,
      claude_id    TEXT NOT NULL UNIQUE,
      workspace    TEXT NOT NULL,
      created_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_claude_sessions_claude_id
      ON claude_sessions (claude_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
      content,
      source_type UNINDEXED,
      source_id UNINDEXED,
      session_id UNINDEXED,
      tokenize='unicode61'
    );

    CREATE TABLE IF NOT EXISTS deleted_sessions (
      external_session_id TEXT PRIMARY KEY,
      deleted_at          TEXT NOT NULL
    );
  `);

  // One-time backfill: index any rows that existed before Phase 8
  // INSERT OR IGNORE is idempotent — re-running on restart will silently skip already-indexed rowids
  db.exec(`
    INSERT OR IGNORE INTO search_fts(rowid, content, source_type, source_id, session_id)
      SELECT sequence_number, payload, 'event', CAST(sequence_number AS TEXT), session_id FROM events;
    INSERT OR IGNORE INTO search_fts(rowid, content, source_type, source_id, session_id)
      SELECT rowid, proposed_action, 'approval', approval_id, session_id FROM approvals;
    INSERT OR IGNORE INTO search_fts(rowid, content, source_type, source_id, session_id)
      SELECT rowid, content, 'memory_note', note_id, workspace FROM memory_notes;
  `);

  // Checkpoint scheduling: fires every 10s, non-blocking (unref so it doesn't keep process alive)
  if (dbPath !== ':memory:') {
    const walPath = `${dbPath}-wal`;
    const interval = setInterval(() => {
      try {
        const stat = fs.statSync(walPath);
        if (stat.size > 10 * 1024 * 1024) {
          db.pragma('wal_checkpoint(RESTART)');
        }
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    }, 10_000);
    interval.unref();
  }

  return db;
}

export function initializeClaudeSessionCache(
  db: Database.Database
): Map<string, string> {
  const cache = new Map<string, string>();
  const rows = db.prepare(
    'SELECT claude_id, session_id FROM claude_sessions'
  ).all() as Array<{ claude_id: string; session_id: string }>;
  for (const row of rows) {
    cache.set(row.claude_id, row.session_id);
  }
  return cache;
}
