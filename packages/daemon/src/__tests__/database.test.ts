import { describe, it, expect } from 'vitest';
import { openDatabase } from '../db/database.js';
import { persistEvent, getEventsSince } from '../db/queries.js';
import type { NormalizedEvent } from '@cockpit/shared';

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
    const db = openDatabase(':memory:');
    const mode = db.pragma('journal_mode', { simple: true });
    expect(mode).toBe('wal');
    db.close();
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
