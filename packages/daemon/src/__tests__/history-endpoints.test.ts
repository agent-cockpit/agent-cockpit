import { describe, it, expect } from 'vitest';
import { openDatabase } from '../db/database.js';
import {
  indexForSearch,
  searchAll,
  getAllSessions,
  getSessionSummary,
  persistEvent,
} from '../db/queries.js';
import type { NormalizedEvent } from '@cockpit/shared';

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    schemaVersion: 1,
    sessionId: 'aaaaaaaa-0000-0000-0000-000000000001',
    timestamp: new Date().toISOString(),
    type: 'session_start',
    provider: 'claude',
    workspacePath: '/home/user/project',
    ...overrides,
  } as NormalizedEvent;
}

const SESSION_A = 'aaaaaaaa-1111-0000-0000-000000000000';
const SESSION_B = 'bbbbbbbb-2222-0000-0000-000000000000';

describe('searchAll', () => {
  it('Test 1: returns SearchResult[] when query matches an indexed event payload', () => {
    const db = openDatabase(':memory:');
    indexForSearch(db, 'hello world unique_token_789', 'event', '42', SESSION_A);
    const results = searchAll(db, 'hello');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({
      sourceType: 'event',
      sourceId: '42',
      sessionId: SESSION_A,
    });
    expect(typeof results[0]!.snippet).toBe('string');
    db.close();
  });

  it('Test 2: returns empty array when query does not match', () => {
    const db = openDatabase(':memory:');
    indexForSearch(db, 'some generic content', 'event', '1', SESSION_A);
    const results = searchAll(db, 'nomatch_xyz_abc');
    expect(results).toEqual([]);
    db.close();
  });

  it('Test 3: sanitizes FTS5 injection — query with double-quotes does not throw', () => {
    const db = openDatabase(':memory:');
    indexForSearch(db, 'some content here', 'event', '1', SESSION_A);
    expect(() => searchAll(db, '"hello OR world"')).not.toThrow();
    expect(() => searchAll(db, '""')).not.toThrow();
    expect(() => searchAll(db, 'test" AND "other')).not.toThrow();
    db.close();
  });
});

describe('getAllSessions', () => {
  it('Test 4: returns SessionSummary[] derived from session_start events with approvalCount and filesChanged', () => {
    const db = openDatabase(':memory:');

    // Insert session_start event for SESSION_A
    persistEvent(db, makeEvent({
      sessionId: SESSION_A,
      type: 'session_start',
      provider: 'claude',
      workspacePath: '/workspace/a',
    }));

    // Insert an approval for SESSION_A
    db.prepare(
      `INSERT INTO approvals (approval_id, session_id, status, action_type, risk_level, proposed_action, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('appr-001', SESSION_A, 'approved', 'shell_command', 'medium', 'ls -la', new Date().toISOString());

    // Insert a file_change event with filePath for SESSION_A
    persistEvent(db, makeEvent({
      sessionId: SESSION_A,
      type: 'file_change',
      filePath: '/workspace/a/index.ts',
    } as Partial<NormalizedEvent>));

    const sessions = getAllSessions(db);
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBe(1);

    const session = sessions[0]!;
    expect(session.sessionId).toBe(SESSION_A);
    expect(session.provider).toBe('claude');
    expect(session.workspacePath).toBe('/workspace/a');
    expect(typeof session.startedAt).toBe('string');
    expect(session.approvalCount).toBe(1);
    expect(session.filesChanged).toBe(1);
    expect(['active', 'ended', 'error']).toContain(session.finalStatus);
    db.close();
  });

  it('Test 5: returns empty array when no sessions exist', () => {
    const db = openDatabase(':memory:');
    const sessions = getAllSessions(db);
    expect(sessions).toEqual([]);
    db.close();
  });
});

describe('getSessionSummary', () => {
  it('Test 6a: returns single SessionSummary for known sessionId', () => {
    const db = openDatabase(':memory:');

    persistEvent(db, makeEvent({
      sessionId: SESSION_B,
      type: 'session_start',
      provider: 'codex',
      workspacePath: '/workspace/b',
    }));

    const summary = getSessionSummary(db, SESSION_B);
    expect(summary).not.toBeNull();
    expect(summary!.sessionId).toBe(SESSION_B);
    expect(summary!.provider).toBe('codex');
    db.close();
  });

  it('Test 6b: returns null for unknown sessionId', () => {
    const db = openDatabase(':memory:');
    const summary = getSessionSummary(db, 'non-existent-session-id');
    expect(summary).toBeNull();
    db.close();
  });
});

describe('indexForSearch integration', () => {
  it('Test 7: indexForSearch inserts a row into search_fts that is findable by searchAll', () => {
    const db = openDatabase(':memory:');
    const uniqueToken = 'uniquetoken_phase8_test_abc123';

    // Before indexing — should not find it
    const beforeResults = searchAll(db, uniqueToken);
    expect(beforeResults).toEqual([]);

    // Index it
    indexForSearch(db, `content with ${uniqueToken} inside`, 'memory_note', 'note-42', SESSION_A);

    // After indexing — should find it
    const afterResults = searchAll(db, uniqueToken);
    expect(afterResults.length).toBeGreaterThan(0);
    expect(afterResults[0]!.sourceType).toBe('memory_note');
    expect(afterResults[0]!.sourceId).toBe('note-42');
    expect(afterResults[0]!.sessionId).toBe(SESSION_A);
    db.close();
  });
});
