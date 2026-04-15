import { describe, it, expect } from 'vitest';
import { openDatabase } from '../db/database.js';
import { indexForSearch, searchAll } from '../db/queries.js';
import type { NormalizedEvent } from '@cockpit/shared';

function makeSessionStartEvent(sessionId: string): NormalizedEvent {
  return {
    schemaVersion: 1,
    sessionId,
    timestamp: new Date().toISOString(),
    type: 'session_start',
    provider: 'claude',
    workspacePath: '/home/user/project',
  } as NormalizedEvent;
}

describe('FTS5 virtual table', () => {
  it('Test 1: openDatabase creates the search_fts table', () => {
    const db = openDatabase(':memory:');
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='search_fts'")
      .get();
    expect(row).toBeDefined();
    db.close();
  });

  it('Test 2: indexForSearch + searchAll returns indexed content', () => {
    const db = openDatabase(':memory:');
    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000001';

    // Insert a synthetic event row directly
    db.prepare(
      `INSERT INTO events (session_id, type, schema_version, payload, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    ).run(sessionId, 'session_start', 1, JSON.stringify({ workspacePath: '/test' }), new Date().toISOString());

    // Index it
    indexForSearch(db, 'hello world unique phrase', 'event', '1', sessionId);

    // Search for it
    const results = searchAll(db, 'hello');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.sourceType).toBe('event');
    expect(results[0]!.sessionId).toBe(sessionId);
    db.close();
  });

  it('Test 3: backfill from existing events runs without error on db with pre-existing rows', () => {
    // Simulate: insert rows into underlying tables, then call openDatabase again
    // (openDatabase is idempotent — calling it runs the backfill SQL)
    // We use a single :memory: db and call openDatabase twice isn't possible for :memory:
    // Instead, we verify: the backfill INSERT OR IGNORE SQL runs fine on a non-empty db
    const db = openDatabase(':memory:');
    const sessionId = 'bbbbbbbb-0000-0000-0000-000000000002';

    // Pre-populate events table (simulating pre-Phase-8 data)
    db.prepare(
      `INSERT INTO events (session_id, type, schema_version, payload, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    ).run(sessionId, 'session_start', 1, JSON.stringify({ workspacePath: '/legacy' }), new Date().toISOString());

    // Re-run the backfill manually to verify it doesn't throw
    expect(() => {
      db.exec(`
        INSERT OR IGNORE INTO search_fts(rowid, content, source_type, source_id, session_id)
          SELECT sequence_number, payload, 'event', CAST(sequence_number AS TEXT), session_id FROM events;
      `);
    }).not.toThrow();

    db.close();
  });
});
