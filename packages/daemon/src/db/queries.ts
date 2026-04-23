import type { NormalizedEvent } from '@cockpit/shared';
import type Database from 'better-sqlite3';

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
  capabilities: SessionCapabilities
  finalStatus: 'active' | 'ended' | 'error'
}

export interface SessionCapabilities {
  managedByDaemon: boolean
  canSendMessage: boolean
  canTerminateSession: boolean
  reason?: string
}

export const EXTERNAL_SESSION_REASON = 'External session is approval-only; chat send and terminate are disabled.'

function toBoolean(value: unknown): boolean | null {
  if (value === true || value === 1 || value === '1') return true
  if (value === false || value === 0 || value === '0') return false
  return null
}

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ')
}

function normalizeAffectedPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const normalized = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
  return [...new Set(normalized)].sort((a, b) => a.localeCompare(b))
}

type SessionStartSignature = {
  provider: string
  workspacePath: string
  managedByDaemon: boolean | null
  canSendMessage: boolean | null
  canTerminateSession: boolean | null
  reason: string
}

type ApprovalSignature = {
  actionType: string
  riskLevel: string
  proposedAction: string
  affectedPaths: string[]
  whyRisky: string
}

function isEventOfType(event: NormalizedEvent, type: string): boolean {
  return (event as Record<string, unknown>)['type'] === type
}

function toSessionStartSignature(event: NormalizedEvent): SessionStartSignature {
  const payload = event as Record<string, unknown>
  return {
    provider: normalizeText(payload['provider'] ?? ''),
    workspacePath: normalizeText(payload['workspacePath'] ?? ''),
    managedByDaemon: toBoolean(payload['managedByDaemon']),
    canSendMessage: toBoolean(payload['canSendMessage']),
    canTerminateSession: toBoolean(payload['canTerminateSession']),
    reason: normalizeText(payload['reason'] ?? ''),
  }
}

function areSessionStartSignaturesEqual(a: SessionStartSignature, b: SessionStartSignature): boolean {
  return (
    a.provider === b.provider &&
    a.workspacePath === b.workspacePath &&
    a.managedByDaemon === b.managedByDaemon &&
    a.canSendMessage === b.canSendMessage &&
    a.canTerminateSession === b.canTerminateSession &&
    a.reason === b.reason
  )
}

function toApprovalSignature(event: NormalizedEvent): ApprovalSignature {
  const payload = event as Record<string, unknown>
  return {
    actionType: normalizeText(payload['actionType'] ?? ''),
    riskLevel: normalizeText(payload['riskLevel'] ?? ''),
    proposedAction: normalizeText(payload['proposedAction'] ?? ''),
    affectedPaths: normalizeAffectedPaths(payload['affectedPaths']),
    whyRisky: normalizeText(payload['whyRisky'] ?? ''),
  }
}

function areApprovalSignaturesEqual(a: ApprovalSignature, b: ApprovalSignature): boolean {
  if (
    a.actionType !== b.actionType ||
    a.riskLevel !== b.riskLevel ||
    a.proposedAction !== b.proposedAction ||
    a.whyRisky !== b.whyRisky
  ) {
    return false
  }
  if (a.affectedPaths.length !== b.affectedPaths.length) return false
  for (let i = 0; i < a.affectedPaths.length; i++) {
    if (a.affectedPaths[i] !== b.affectedPaths[i]) return false
  }
  return true
}

function inferManagedByDaemon(db: Database.Database, sessionId: string, provider: string): boolean {
  if (provider === 'codex') {
    const row = db
      .prepare('SELECT 1 AS found FROM codex_sessions WHERE session_id = ? LIMIT 1')
      .get(sessionId) as { found: number } | undefined
    return !!row?.found
  }

  if (provider === 'claude') {
    const row = db
      .prepare('SELECT 1 AS found FROM claude_sessions WHERE session_id = ? AND claude_id = ? LIMIT 1')
      .get(sessionId, sessionId) as { found: number } | undefined
    return !!row?.found
  }

  return false
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
      JSON_EXTRACT(e.payload, '$.managedByDaemon') AS managedByDaemon,
      JSON_EXTRACT(e.payload, '$.canSendMessage') AS canSendMessage,
      JSON_EXTRACT(e.payload, '$.canTerminateSession') AS canTerminateSession,
      JSON_EXTRACT(e.payload, '$.reason') AS capabilityReason,
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
    managedByDaemon: unknown; canSendMessage: unknown; canTerminateSession: unknown; capabilityReason: unknown;
  }>;
  return rows.map((r) => {
    const managedFromPayload = toBoolean(r.managedByDaemon)
    const canSendFromPayload = toBoolean(r.canSendMessage)
    const canTerminateFromPayload = toBoolean(r.canTerminateSession)
    const inferredManaged = inferManagedByDaemon(db, r.sessionId, r.provider)
    const managedByDaemon = managedFromPayload ?? inferredManaged
    const canSendMessage = canSendFromPayload ?? managedByDaemon
    const canTerminateSession = canTerminateFromPayload ?? managedByDaemon
    const reasonFromPayload = typeof r.capabilityReason === 'string' ? r.capabilityReason : undefined
    const reason = reasonFromPayload ?? (!managedByDaemon ? EXTERNAL_SESSION_REASON : undefined)

    return {
      sessionId: r.sessionId,
      provider: r.provider,
      workspacePath: r.workspacePath,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      approvalCount: r.approvalCount,
      filesChanged: r.filesChanged,
      capabilities: {
        managedByDaemon,
        canSendMessage,
        canTerminateSession,
        ...(reason ? { reason } : {}),
      },
      finalStatus: r.endedAt ? 'ended' : 'active',
    } as SessionSummary
  })
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

export function hasEquivalentSessionStart(db: Database.Database, event: NormalizedEvent): boolean {
  if (!isEventOfType(event, 'session_start')) return false
  const candidate = toSessionStartSignature(event)
  const rows = db.prepare<[string], { payload: string }>(
    `SELECT payload
     FROM events
     WHERE session_id = ? AND type = 'session_start'`
  ).all(event.sessionId)

  for (const row of rows) {
    const existing = JSON.parse(row.payload) as NormalizedEvent
    if (areSessionStartSignaturesEqual(candidate, toSessionStartSignature(existing))) {
      return true
    }
  }
  return false
}

export function hasEquivalentPendingApprovalRequest(db: Database.Database, event: NormalizedEvent): boolean {
  if (!isEventOfType(event, 'approval_request')) return false
  const candidate = toApprovalSignature(event)
  const rows = db.prepare<[string], { payload: string }>(
    `SELECT e.payload
     FROM events e
     WHERE e.session_id = ?
       AND e.type = 'approval_request'
       AND NOT EXISTS (
         SELECT 1
         FROM events r
         WHERE r.session_id = e.session_id
           AND r.type = 'approval_resolved'
           AND COALESCE(JSON_EXTRACT(r.payload, '$.approvalId'), '') =
               COALESCE(JSON_EXTRACT(e.payload, '$.approvalId'), '')
       )
     ORDER BY e.sequence_number DESC
     LIMIT 200`
  ).all(event.sessionId)

  for (const row of rows) {
    const existing = JSON.parse(row.payload) as NormalizedEvent
    if (areApprovalSignaturesEqual(candidate, toApprovalSignature(existing))) {
      return true
    }
  }
  return false
}

export function shouldPersistEvent(db: Database.Database, event: NormalizedEvent): {
  shouldPersist: boolean
  reason?: 'duplicate_session_start' | 'duplicate_pending_approval'
} {
  if (isEventOfType(event, 'session_start') && hasEquivalentSessionStart(db, event)) {
    return { shouldPersist: false, reason: 'duplicate_session_start' }
  }
  if (isEventOfType(event, 'approval_request') && hasEquivalentPendingApprovalRequest(db, event)) {
    return { shouldPersist: false, reason: 'duplicate_pending_approval' }
  }
  return { shouldPersist: true }
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

export interface CleanupDuplicateResult {
  deletedSessionStartEvents: number
  deletedApprovalRequestEvents: number
  deletedPendingApprovals: number
}

export function cleanupDuplicateRecords(db: Database.Database): CleanupDuplicateResult {
  return db.transaction(() => {
    const duplicateSessionStartRows = db.prepare<[], { sequence_number: number }>(`
      WITH ranked AS (
        SELECT
          sequence_number,
          ROW_NUMBER() OVER (
            PARTITION BY
              session_id,
              COALESCE(JSON_EXTRACT(payload, '$.provider'), ''),
              COALESCE(JSON_EXTRACT(payload, '$.workspacePath'), ''),
              COALESCE(JSON_EXTRACT(payload, '$.managedByDaemon'), ''),
              COALESCE(JSON_EXTRACT(payload, '$.canSendMessage'), ''),
              COALESCE(JSON_EXTRACT(payload, '$.canTerminateSession'), ''),
              COALESCE(JSON_EXTRACT(payload, '$.reason'), '')
            ORDER BY sequence_number ASC
          ) AS rn
        FROM events
        WHERE type = 'session_start'
      )
      SELECT sequence_number
      FROM ranked
      WHERE rn > 1
    `).all()

    const duplicateApprovalRequestRows = db.prepare<[], { sequence_number: number }>(`
      WITH ranked AS (
        SELECT
          sequence_number,
          ROW_NUMBER() OVER (
            PARTITION BY
              session_id,
              COALESCE(JSON_EXTRACT(payload, '$.actionType'), ''),
              COALESCE(JSON_EXTRACT(payload, '$.riskLevel'), ''),
              COALESCE(JSON_EXTRACT(payload, '$.proposedAction'), ''),
              COALESCE(JSON_EXTRACT(payload, '$.whyRisky'), ''),
              COALESCE(JSON_EXTRACT(payload, '$.affectedPaths'), '')
            ORDER BY sequence_number ASC
          ) AS rn
        FROM events
        WHERE type = 'approval_request'
      )
      SELECT sequence_number
      FROM ranked
      WHERE rn > 1
    `).all()

    const duplicatePendingApprovals = db.prepare<[], { approval_id: string }>(`
      WITH ranked AS (
        SELECT
          approval_id,
          ROW_NUMBER() OVER (
            PARTITION BY
              session_id,
              status,
              action_type,
              risk_level,
              proposed_action,
              COALESCE(affected_paths, ''),
              COALESCE(why_risky, '')
            ORDER BY created_at ASC, approval_id ASC
          ) AS rn
        FROM approvals
        WHERE status = 'pending'
      )
      SELECT approval_id
      FROM ranked
      WHERE rn > 1
    `).all()

    const deleteEvent = db.prepare('DELETE FROM events WHERE sequence_number = ?')
    const deleteEventFts = db.prepare(
      "DELETE FROM search_fts WHERE source_type = 'event' AND source_id = ?"
    )
    for (const row of duplicateSessionStartRows) {
      deleteEvent.run(row.sequence_number)
      deleteEventFts.run(String(row.sequence_number))
    }
    for (const row of duplicateApprovalRequestRows) {
      deleteEvent.run(row.sequence_number)
      deleteEventFts.run(String(row.sequence_number))
    }

    const deleteApproval = db.prepare('DELETE FROM approvals WHERE approval_id = ?')
    const deleteApprovalFts = db.prepare(
      "DELETE FROM search_fts WHERE source_type = 'approval' AND source_id = ?"
    )
    for (const row of duplicatePendingApprovals) {
      deleteApproval.run(row.approval_id)
      deleteApprovalFts.run(row.approval_id)
    }

    return {
      deletedSessionStartEvents: duplicateSessionStartRows.length,
      deletedApprovalRequestEvents: duplicateApprovalRequestRows.length,
      deletedPendingApprovals: duplicatePendingApprovals.length,
    }
  })()
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

export function deleteSessionRecords(db: Database.Database, sessionId: string): void {
  const remove = db.transaction((id: string) => {
    db.prepare('DELETE FROM search_fts WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM always_allow_rules WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM approvals WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM events WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM codex_sessions WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM claude_sessions WHERE session_id = ?').run(id);
  });

  remove(sessionId);
}
