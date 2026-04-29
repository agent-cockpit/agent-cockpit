import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { openDatabase, initializeClaudeSessionCache } from '../db/database.js';
import {
  persistEvent,
  getEventsSince,
  getEventsBySession,
  getClaudeSessionId,
  setClaudeSessionId,
  shouldPersistEvent,
  cleanupDuplicateRecords,
} from '../db/queries.js';
import type { NormalizedEvent } from '@agentcockpit/shared';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { Database } from 'better-sqlite3';

// Helper: valid NormalizedEvent (no sequenceNumber — DB assigns it)
function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    schemaVersion: 1,
    sessionId: '123e4567-e89b-12d3-a456-426614174000',
    timestamp: new Date().toISOString(),
    type: 'session_start',
    provider: 'claude',
    workspacePath: '/home/user/project',
    ...overrides,
  } as NormalizedEvent;
}

describe('openDatabase', () => {
  it('returns a Database instance', () => {
    const db = openDatabase(':memory:');
    expect(db).toBeDefined();
    db.close();
  });

  it('enables WAL mode (journal_mode = wal)', () => {
    // WAL mode requires a file-based database; :memory: databases always use 'memory' journal mode
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-test-'));
    const dbPath = path.join(tmpDir, 'test.db');
    try {
      const db = openDatabase(dbPath);
      const mode = db.pragma('journal_mode', { simple: true });
      expect(mode).toBe('wal');
      db.close();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates the events table', () => {
    const db = openDatabase(':memory:');
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='events'"
    ).get();
    expect(row).toBeDefined();
    db.close();
  });

  it('creates the idx_events_session index', () => {
    const db = openDatabase(':memory:');
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_events_session'"
    ).get();
    expect(row).toBeDefined();
    db.close();
  });

  it('creates indexed event metadata columns for correlation and project lookups', () => {
    const db = openDatabase(':memory:');
    const schema = db.prepare('PRAGMA table_info(events)').all() as Array<{ name: string }>;
    const columnNames = schema.map((col) => col.name);
    expect(columnNames).toContain('parent_event_id');
    expect(columnNames).toContain('correlation_id');
    expect(columnNames).toContain('project_id');

    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as Array<{ name: string }>;
    const indexNames = indexes.map((row) => row.name);
    expect(indexNames).toContain('idx_events_correlation');
    expect(indexNames).toContain('idx_events_project');
    db.close();
  });

  it('migrates legacy events tables before creating metadata indexes', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-legacy-events-'));
    const dbPath = path.join(tmpDir, 'legacy.db');
    try {
      const legacy = openDatabase(dbPath);
      legacy.exec(`
        DROP INDEX IF EXISTS idx_events_correlation;
        DROP INDEX IF EXISTS idx_events_project;
        CREATE TABLE legacy_events AS
          SELECT sequence_number, session_id, type, schema_version, payload, timestamp FROM events;
        DROP TABLE events;
        ALTER TABLE legacy_events RENAME TO events;
      `);
      legacy.close();

      const migrated = openDatabase(dbPath);
      const schema = migrated.prepare('PRAGMA table_info(events)').all() as Array<{ name: string }>;
      const columnNames = schema.map((col) => col.name);
      expect(columnNames).toContain('correlation_id');
      expect(columnNames).toContain('parent_event_id');
      expect(columnNames).toContain('project_id');
      const correlationIndex = migrated.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_events_correlation'"
      ).get();
      expect(correlationIndex).toBeDefined();
      migrated.close();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('persistEvent', () => {
  it('returns the event with a positive integer sequenceNumber', () => {
    const db = openDatabase(':memory:');
    const event = makeEvent();
    const saved = persistEvent(db, event);
    expect(typeof saved.sequenceNumber).toBe('number');
    expect(saved.sequenceNumber).toBeGreaterThan(0);
    db.close();
  });

  it('assigns monotonically increasing sequenceNumbers', () => {
    const db = openDatabase(':memory:');
    const e1 = persistEvent(db, makeEvent());
    const e2 = persistEvent(db, makeEvent());
    expect(e2.sequenceNumber).toBe((e1.sequenceNumber ?? 0) + 1);
    db.close();
  });

  it('stores the full event payload as JSON', () => {
    const db = openDatabase(':memory:');
    const event = makeEvent();
    const saved = persistEvent(db, event);
    const row = db.prepare(
      'SELECT payload FROM events WHERE sequence_number = ?'
    ).get(saved.sequenceNumber) as { payload: string } | undefined;
    expect(row).toBeDefined();
    const parsed = JSON.parse(row!.payload);
    expect(parsed.type).toBe('session_start');
    expect(parsed.sessionId).toBe(event.sessionId);
    db.close();
  });

  it('stores correlation metadata and a raw payload row for every event', () => {
    const db = openDatabase(':memory:');
    const event = makeEvent({
      parentEventId: 7,
      correlationId: 'flow-123',
      projectId: 'project-abc',
    });
    const saved = persistEvent(db, event);

    const row = db.prepare(
      'SELECT parent_event_id, correlation_id, project_id FROM events WHERE sequence_number = ?'
    ).get(saved.sequenceNumber) as { parent_event_id: number; correlation_id: string; project_id: string } | undefined;
    expect(row).toEqual({
      parent_event_id: 7,
      correlation_id: 'flow-123',
      project_id: 'project-abc',
    });

    const raw = db.prepare(
      'SELECT session_id, provider, payload FROM raw_payloads WHERE sequence_number = ?'
    ).get(saved.sequenceNumber) as { session_id: string; provider: string; payload: string } | undefined;
    expect(raw?.session_id).toBe(event.sessionId);
    expect(raw?.provider).toBe('claude');
    expect(JSON.parse(raw!.payload).correlationId).toBe('flow-123');
    db.close();
  });

  it('infers parentEventId from the previous event with the same correlationId', () => {
    const db = openDatabase(':memory:');
    const first = persistEvent(db, makeEvent({ correlationId: 'flow-456' }));
    const second = persistEvent(db, makeEvent({
      type: 'command_completed',
      command: 'pnpm test',
      correlationId: 'flow-456',
    }));

    expect(second.parentEventId).toBe(first.sequenceNumber);
    const row = db.prepare(
      'SELECT parent_event_id, payload FROM events WHERE sequence_number = ?'
    ).get(second.sequenceNumber) as { parent_event_id: number; payload: string } | undefined;
    expect(row?.parent_event_id).toBe(first.sequenceNumber);
    expect(JSON.parse(row!.payload).parentEventId).toBe(first.sequenceNumber);
    db.close();
  });
});

describe('getEventsSince', () => {
  it('returns all events when lastSeenSequence = 0', () => {
    const db = openDatabase(':memory:');
    persistEvent(db, makeEvent());
    persistEvent(db, makeEvent());
    persistEvent(db, makeEvent());
    const events = getEventsSince(db, 0);
    expect(events).toHaveLength(3);
    db.close();
  });

  it('returns only events after lastSeenSequence', () => {
    const db = openDatabase(':memory:');
    const e1 = persistEvent(db, makeEvent());
    persistEvent(db, makeEvent());
    persistEvent(db, makeEvent());
    const events = getEventsSince(db, e1.sequenceNumber ?? 0);
    expect(events).toHaveLength(2);
    db.close();
  });

  it('returns empty array when lastSeenSequence is at or beyond max', () => {
    const db = openDatabase(':memory:');
    persistEvent(db, makeEvent());
    const events = getEventsSince(db, 9999);
    expect(events).toHaveLength(0);
    db.close();
  });

  it('returns events in ascending sequence_number order', () => {
    const db = openDatabase(':memory:');
    persistEvent(db, makeEvent());
    persistEvent(db, makeEvent());
    persistEvent(db, makeEvent());
    const events = getEventsSince(db, 0);
    const sequences = events.map((e) => e.sequenceNumber);
    expect(sequences).toEqual([...sequences].sort((a, b) => (a ?? 0) - (b ?? 0)));
    db.close();
  });
});

describe('getEventsBySession', () => {
  it('returns [] for a sessionId with no events', () => {
    const db = openDatabase(':memory:');
    const events = getEventsBySession(db, 'non-existent-session');
    expect(events).toEqual([]);
    db.close();
  });

  it('returns only events for the requested sessionId (not events from other sessions)', () => {
    const db = openDatabase(':memory:');
    const sessionA = 'aaaaaaaa-0000-0000-0000-000000000000';
    const sessionB = 'bbbbbbbb-0000-0000-0000-000000000000';
    persistEvent(db, makeEvent({ sessionId: sessionA }));
    persistEvent(db, makeEvent({ sessionId: sessionB }));
    persistEvent(db, makeEvent({ sessionId: sessionA }));
    const events = getEventsBySession(db, sessionA);
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.sessionId === sessionA)).toBe(true);
    db.close();
  });

  it('returns events ordered by sequenceNumber ASC', () => {
    const db = openDatabase(':memory:');
    const sessionId = 'cccccccc-0000-0000-0000-000000000000';
    persistEvent(db, makeEvent({ sessionId }));
    persistEvent(db, makeEvent({ sessionId }));
    persistEvent(db, makeEvent({ sessionId }));
    const events = getEventsBySession(db, sessionId);
    const sequences = events.map((e) => e.sequenceNumber);
    expect(sequences).toEqual([...sequences].sort((a, b) => (a ?? 0) - (b ?? 0)));
    db.close();
  });

  it('each returned object has sequenceNumber merged in', () => {
    const db = openDatabase(':memory:');
    const sessionId = 'dddddddd-0000-0000-0000-000000000000';
    persistEvent(db, makeEvent({ sessionId }));
    const events = getEventsBySession(db, sessionId);
    expect(events).toHaveLength(1);
    expect(typeof events[0]!.sequenceNumber).toBe('number');
    expect(events[0]!.sequenceNumber).toBeGreaterThan(0);
    db.close();
  });

  it('handles multiple sessions stored in the same DB', () => {
    const db = openDatabase(':memory:');
    const sessions = [
      'eeeeeeee-0000-0000-0000-000000000000',
      'ffffffff-0000-0000-0000-000000000000',
      '11111111-0000-0000-0000-000000000000',
    ];
    // Interleave events from multiple sessions
    for (let i = 0; i < 3; i++) {
      for (const sid of sessions) {
        persistEvent(db, makeEvent({ sessionId: sid }));
      }
    }
    for (const sid of sessions) {
      const events = getEventsBySession(db, sid);
      expect(events).toHaveLength(3);
      expect(events.every((e) => e.sessionId === sid)).toBe(true);
    }
    db.close();
  });
});

describe('claude_sessions table and cache', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('claude_sessions table is created with correct schema', () => {
    // Query sqlite_master for table 'claude_sessions'
    const tableRow = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='claude_sessions'"
    ).get();
    expect(tableRow).toBeDefined();

    // Query table schema to verify columns: session_id (PK), claude_id, workspace, created_at
    const schema = db.prepare('PRAGMA table_info(claude_sessions)').all() as Array<{
      name: string;
      type: string;
      pk: number;
    }>;

    const columnNames = schema.map(col => col.name);
    expect(columnNames).toContain('session_id');
    expect(columnNames).toContain('claude_id');
    expect(columnNames).toContain('workspace');
    expect(columnNames).toContain('created_at');

    // Verify session_id is the primary key
    const sessionPk = schema.find(col => col.name === 'session_id');
    expect(sessionPk?.pk).toBe(1);
  });

  it('idx_claude_sessions_claude_id index exists', () => {
    // Query sqlite_master for index 'idx_claude_sessions_claude_id'
    const indexRow = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_claude_sessions_claude_id'"
    ).get();
    expect(indexRow).toBeDefined();
  });

  it('initializeClaudeSessionCache() returns Map populated from database rows', () => {
    // Manually insert test row into claude_sessions
    const testClaudeId = 'test-cache-1';
    const testSessionId = 'aaaaaaaa-0000-0000-0000-000000000001';
    db.prepare(
      'INSERT INTO claude_sessions (session_id, claude_id, workspace, created_at) VALUES (?, ?, ?, ?)'
    ).run(testSessionId, testClaudeId, '/test/workspace', new Date().toISOString());

    const cache = initializeClaudeSessionCache(db);

    expect(cache).toBeInstanceOf(Map);
    expect(cache.size).toBe(1);
    expect(cache.get(testClaudeId)).toBe(testSessionId);
  });

  it('initializeClaudeSessionCache() returns empty Map when table is empty', () => {
    const cache = initializeClaudeSessionCache(db);

    expect(cache).toBeInstanceOf(Map);
    expect(cache.size).toBe(0);
  });

  it('getClaudeSessionId() returns existing mapping or null', () => {
    // Insert test mapping
    const testClaudeId = 'test-get-1';
    const testSessionId = 'bbbbbbbb-0000-0000-0000-000000000001';
    setClaudeSessionId(db, testSessionId, testClaudeId, '/test/workspace');

    // Query back
    const result = getClaudeSessionId(db, testClaudeId);
    expect(result).toBe(testSessionId);

    // Query non-existent claude_id
    const missing = getClaudeSessionId(db, 'does-not-exist');
    expect(missing).toBeNull();
  });

  it('setClaudeSessionId() inserts new mapping and INSERT OR IGNORE prevents duplicates', () => {
    const testClaudeId = 'test-dup-1';
    const testSessionId = 'cccccccc-0000-0000-0000-000000000001';

    // Insert first mapping
    setClaudeSessionId(db, testSessionId, testClaudeId, '/test/workspace');

    // Verify row exists
    const row1 = db.prepare('SELECT COUNT(*) as count FROM claude_sessions WHERE claude_id = ?')
      .get(testClaudeId) as { count: number };
    expect(row1.count).toBe(1);

    // Try to insert duplicate with same claude_id
    const duplicateSessionId = 'dddddddd-0000-0000-0000-000000000001';
    setClaudeSessionId(db, duplicateSessionId, testClaudeId, '/test/workspace');

    // Verify still only 1 row exists (INSERT OR IGNORE worked)
    const row2 = db.prepare('SELECT COUNT(*) as count FROM claude_sessions WHERE claude_id = ?')
      .get(testClaudeId) as { count: number };
    expect(row2.count).toBe(1);

    // Verify original session_id is preserved
    const result = db.prepare('SELECT session_id FROM claude_sessions WHERE claude_id = ?')
      .get(testClaudeId) as { session_id: string };
    expect(result.session_id).toBe(testSessionId);
  });
});

describe('event dedupe guards', () => {
  it('suppresses duplicate equivalent session_start events', () => {
    const db = openDatabase(':memory:');
    const event = makeEvent({
      sessionId: 'dedupe-session-start',
      type: 'session_start',
      provider: 'claude',
      workspacePath: '/tmp/workspace',
      managedByDaemon: true,
      canSendMessage: true,
      canTerminateSession: true,
    });
    persistEvent(db, event);
    const check = shouldPersistEvent(db, event);
    expect(check.shouldPersist).toBe(false);
    expect(check.reason).toBe('duplicate_session_start');
    db.close();
  });

  it('suppresses duplicate equivalent pending approval_request events', () => {
    const db = openDatabase(':memory:');
    const sessionId = 'dedupe-approval-session';
    const approval = makeEvent({
      sessionId,
      type: 'approval_request',
      actionType: 'shell_command',
      riskLevel: 'high',
      approvalId: 'approval-a',
      proposedAction: 'Bash: {"command":"git log main..HEAD --oneline"}',
      affectedPaths: [],
      whyRisky: 'shell',
    });
    persistEvent(db, approval);
    const check = shouldPersistEvent(db, {
      ...approval,
      approvalId: 'approval-b',
      timestamp: new Date().toISOString(),
    });
    expect(check.shouldPersist).toBe(false);
    expect(check.reason).toBe('duplicate_pending_approval');
    db.close();
  });
});

describe('cleanupDuplicateRecords', () => {
  it('removes duplicate session_start and pending approvals while preserving one canonical row', () => {
    const db = openDatabase(':memory:');
    const sessionId = 'cleanup-session';
    const ts = new Date().toISOString();

    persistEvent(db, makeEvent({
      sessionId,
      type: 'session_start',
      provider: 'claude',
      workspacePath: '/tmp/workspace',
      managedByDaemon: true,
      canSendMessage: true,
      canTerminateSession: true,
      timestamp: ts,
    }));
    persistEvent(db, makeEvent({
      sessionId,
      type: 'session_start',
      provider: 'claude',
      workspacePath: '/tmp/workspace',
      managedByDaemon: true,
      canSendMessage: true,
      canTerminateSession: true,
      timestamp: ts,
    }));

    db.prepare(`
      INSERT INTO approvals
        (approval_id, session_id, status, action_type, risk_level, proposed_action, affected_paths, why_risky, created_at)
      VALUES
        ('pending-a', ?, 'pending', 'shell_command', 'high', 'Bash: {"command":"pwd"}', '[]', 'shell', ?),
        ('pending-b', ?, 'pending', 'shell_command', 'high', 'Bash: {"command":"pwd"}', '[]', 'shell', ?)
    `).run(sessionId, ts, sessionId, ts);

    const result = cleanupDuplicateRecords(db);
    expect(result.deletedSessionStartEvents).toBe(1);
    expect(result.deletedPendingApprovals).toBe(1);

    const starts = db.prepare(
      "SELECT COUNT(*) AS count FROM events WHERE session_id = ? AND type = 'session_start'"
    ).get(sessionId) as { count: number };
    expect(starts.count).toBe(1);

    const pending = db.prepare(
      "SELECT COUNT(*) AS count FROM approvals WHERE session_id = ? AND status = 'pending'"
    ).get(sessionId) as { count: number };
    expect(pending.count).toBe(1);

    db.close();
  });
});
