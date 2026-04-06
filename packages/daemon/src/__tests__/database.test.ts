import { describe, it, expect, afterEach } from 'vitest';
import { openDatabase } from '../db/database.js';
import { persistEvent, getEventsSince, getEventsBySession } from '../db/queries.js';
import type { NormalizedEvent } from '@cockpit/shared';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

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
