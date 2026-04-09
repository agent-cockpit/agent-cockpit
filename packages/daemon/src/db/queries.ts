import type Database from 'better-sqlite3';
import type { NormalizedEvent } from '@cockpit/shared';

export interface SearchResult {
  sourceType: 'event' | 'approval' | 'memory_note'
  sourceId: string
  sessionId: string
  snippet: string
}

export interface SessionSummary {
  sessionId: string
  provider: string
  workspacePath: string
  startedAt: string
  endedAt: string | null
  approvalCount: number
  filesChanged: number
  finalStatus: 'active' | 'ended' | 'error'
}

export function indexForSearch(
  db: Database.Database,
  text: string,
  sourceType: 'event' | 'approval' | 'memory_note',
  sourceId: string | number,
  sessionId: string,
): void {
  db.prepare(`INSERT INTO search_fts(content, source_type, source_id, session_id) VALUES (?, ?, ?, ?)`)
    .run(text, sourceType, String(sourceId), sessionId);
}

export function searchAll(db: Database.Database, query: string): SearchResult[] {
  if (!query.trim()) return [];
  // Wrap in double-quotes to force phrase query and prevent FTS5 syntax injection
  const sanitized = '"' + query.replace(/"/g, '""') + '"';
  const rows = db.prepare(`
    SELECT source_type AS sourceType, source_id AS sourceId, session_id AS sessionId,
           snippet(search_fts, 0, '<b>', '</b>', '...', 20) AS snippet
    FROM search_fts
    WHERE search_fts MATCH ?
    ORDER BY rank
    LIMIT 50
  `).all(sanitized) as SearchResult[];
  return rows;
}

export function getAllSessions(db: Database.Database): SessionSummary[] {
  const rows = db.prepare(`
    SELECT
      e.session_id AS sessionId,
      COALESCE(JSON_EXTRACT(e.payload, '$.provider'), 'unknown') AS provider,
      COALESCE(JSON_EXTRACT(e.payload, '$.workspacePath'), '') AS workspacePath,
      e.timestamp AS startedAt,
      (SELECT timestamp FROM events WHERE session_id = e.session_id AND type = 'session_end'
       ORDER BY sequence_number DESC LIMIT 1) AS endedAt,
      (SELECT COUNT(*) FROM approvals WHERE session_id = e.session_id) AS approvalCount,
      (SELECT COUNT(DISTINCT JSON_EXTRACT(payload, '$.filePath'))
       FROM events WHERE session_id = e.session_id AND type = 'file_change') AS filesChanged
    FROM events e
    WHERE e.type = 'session_start'
    ORDER BY e.timestamp DESC
  `).all() as Array<{
    sessionId: string; provider: string; workspacePath: string; startedAt: string;
    endedAt: string | null; approvalCount: number; filesChanged: number;
  }>;
  return rows.map(r => ({
    ...r,
    finalStatus: r.endedAt ? 'ended' : 'active',
  } as SessionSummary));
}

export function getSessionSummary(db: Database.Database, sessionId: string): SessionSummary | null {
  const all = getAllSessions(db);
  return all.find(s => s.sessionId === sessionId) ?? null;
}

export function persistEvent(
  db: Database.Database,
  event: NormalizedEvent,
): NormalizedEvent & { sequenceNumber: number } {
  const stmt = db.prepare<{
    sessionId: string;
    type: string;
    schemaVersion: number;
    payload: string;
    timestamp: string;
  }>(`
    INSERT INTO events (session_id, type, schema_version, payload, timestamp)
    VALUES (@sessionId, @type, @schemaVersion, @payload, @timestamp)
  `);

  const result = stmt.run({
    sessionId: event.sessionId,
    type: event.type,
    schemaVersion: event.schemaVersion,
    payload: JSON.stringify(event),
    timestamp: event.timestamp,
  });

  const sequenceNumber = result.lastInsertRowid as number;

  // Index for full-text search — extract searchable text fields from payload
  const p = event as Record<string, unknown>;
  const searchText = [
    event.type,
    p['proposedAction'] ?? '',
    p['filePath'] ?? '',
    p['toolName'] ?? '',
    p['workspacePath'] ?? '',
    p['memoryKey'] ?? '',
    p['value'] ?? '',
  ]
    .join(' ')
    .trim();
  indexForSearch(db, searchText, 'event', sequenceNumber, event.sessionId);

  return { ...event, sequenceNumber };
}

export function getEventsBySession(
  db: Database.Database,
  sessionId: string,
): Array<NormalizedEvent & { sequenceNumber: number }> {
  const rows = db.prepare<[string], { payload: string; sequence_number: number }>(
    'SELECT payload, sequence_number FROM events WHERE session_id = ? ORDER BY sequence_number ASC'
  ).all(sessionId);
  return rows.map((row) => ({
    ...(JSON.parse(row.payload) as NormalizedEvent),
    sequenceNumber: row.sequence_number,
  }));
}

export function getEventsSince(
  db: Database.Database,
  lastSeenSequence: number,
): Array<NormalizedEvent & { sequenceNumber: number }> {
  const rows = db.prepare<[number], { payload: string; sequence_number: number }>(
    'SELECT payload, sequence_number FROM events WHERE sequence_number > ? ORDER BY sequence_number ASC'
  ).all(lastSeenSequence);

  return rows.map((row) => ({
    ...(JSON.parse(row.payload) as NormalizedEvent),
    sequenceNumber: row.sequence_number,
  }));
}

export function getClaudeSessionId(
  db: Database.Database,
  claudeId: string
): string | null {
  const row = db.prepare(
    'SELECT session_id FROM claude_sessions WHERE claude_id = ?'
  ).get(claudeId) as { session_id: string } | undefined;
  return row?.session_id ?? null;
}

/**
 * Returns session IDs that already have a session_start event with a non-empty workspacePath.
 * Used at daemon startup to pre-populate initStartedSessions so restarts don't re-emit.
 */
/**
 * Returns session IDs that have a session_start but no session_end and whose
 * last event is older than the given cutoff ISO timestamp.
 * Used at startup to emit session_end for dead sessions so the UI shows them as ended.
 */
export function getOrphanedSessionIds(db: Database.Database, cutoffIso: string): string[] {
  const rows = db.prepare<[string], { session_id: string }>(`
    SELECT DISTINCT e.session_id
    FROM events e
    WHERE e.type = 'session_start'
      AND NOT EXISTS (
        SELECT 1 FROM events WHERE session_id = e.session_id AND type = 'session_end'
      )
      AND (
        SELECT MAX(timestamp) FROM events WHERE session_id = e.session_id
      ) < ?
  `).all(cutoffIso);
  return rows.map(r => r.session_id);
}

export function getStartedSessionIds(db: Database.Database): string[] {
  const rows = db.prepare<[], { session_id: string }>(
    `SELECT DISTINCT session_id FROM events
     WHERE type = 'session_start'
     AND JSON_EXTRACT(payload, '$.workspacePath') != ''`
  ).all();
  return rows.map(r => r.session_id);
}

/**
 * Backfill session_start events for sessions in claude_sessions that lack one.
 * Runs at daemon startup — idempotent (INSERT only for sessions with no session_start).
 * Fixes sessions created before the synthetic-session-start logic was added.
 */
export function backfillSessionStarts(db: Database.Database): void {
  const missing = db.prepare<[], { session_id: string; workspace: string; created_at: string }>(`
    SELECT cs.session_id, cs.workspace, cs.created_at
    FROM claude_sessions cs
    WHERE cs.workspace != ''
      AND NOT EXISTS (
        SELECT 1 FROM events
        WHERE session_id = cs.session_id AND type = 'session_start'
        AND JSON_EXTRACT(payload, '$.workspacePath') != ''
      )
  `).all();

  const insert = db.prepare(`
    INSERT INTO events (session_id, type, schema_version, payload, timestamp)
    VALUES (?, 'session_start', 1, ?, ?)
  `);

  for (const row of missing) {
    const payload = JSON.stringify({
      schemaVersion: 1,
      sessionId: row.session_id,
      type: 'session_start',
      provider: 'claude',
      workspacePath: row.workspace,
      timestamp: row.created_at,
    });
    insert.run(row.session_id, payload, row.created_at);
  }
}

export function setClaudeSessionId(
  db: Database.Database,
  sessionId: string,
  claudeId: string,
  workspace: string
): void {
  db.prepare(
    'INSERT OR IGNORE INTO claude_sessions (session_id, claude_id, workspace, created_at) VALUES (?, ?, ?, ?)'
  ).run(sessionId, claudeId, workspace, new Date().toISOString());
}
