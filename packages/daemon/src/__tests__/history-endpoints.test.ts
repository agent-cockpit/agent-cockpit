import type { NormalizedEvent } from '@agentcockpit/shared';
import type Database from 'better-sqlite3';
import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database.js';
import {
    getAllSessions,
    getSessionSummary,
    indexForSearch,
    persistEvent,
    searchAll,
} from '../db/queries.js';
import { createWsServer } from '../ws/server.js';

// ---- HTTP helper ----

function httpGetJson(
  port: number,
  urlPath: string,
): Promise<{ status: number; body: unknown; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: 'localhost', port, path: urlPath, method: 'GET' },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : null, headers: res.headers });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function httpJson(
  port: number,
  method: 'GET' | 'DELETE',
  urlPath: string,
  body?: unknown,
): Promise<{ status: number; body: unknown; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path: urlPath,
        method,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': String(Buffer.byteLength(payload)),
            }
          : undefined,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : null, headers: res.headers });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---- HTTP endpoint test setup ----

let db: Database.Database;
let httpServer: http.Server;
let port: number;

beforeEach(async () => {
  db = openDatabase(':memory:');
  const server = createWsServer(db, 0);
  httpServer = server.httpServer;
  await new Promise<void>((resolve) => {
    if (httpServer.listening) resolve();
    else httpServer.on('listening', resolve);
  });
  const addr = httpServer.address();
  port = typeof addr === 'object' && addr ? addr.port : 0;
});

afterEach(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  db.close();
});

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

// ---- HTTP endpoint tests (Plan 02) ----

function makeSessionStartEventHttp(sessionId: string, workspacePath: string): NormalizedEvent {
  return {
    schemaVersion: 1,
    sessionId,
    timestamp: new Date().toISOString(),
    type: 'session_start',
    provider: 'claude',
    workspacePath,
  } as NormalizedEvent;
}

describe('GET /api/search', () => {
  it('Test H1: returns 200 JSON array for matching query', async () => {
    const sessionId = 'search-session-001';
    persistEvent(db, makeSessionStartEventHttp(sessionId, '/workspace/search'));
    indexForSearch(db, 'hello world from http test', 'event', 'evt-001', sessionId);

    const { status, body, headers } = await httpGetJson(port, '/api/search?q=hello');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    const results = body as Array<{ sourceType: string; sourceId: string; sessionId: string; snippet: string }>;
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.sourceType).toBe('event');
    expect(headers['access-control-allow-origin']).toBe('*');
  });

  it('Test H2: returns 200 empty array when no q param provided', async () => {
    const { status, body } = await httpGetJson(port, '/api/search');
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it('Test H2b: returns 200 empty array when q param is empty string', async () => {
    const { status, body } = await httpGetJson(port, '/api/search?q=');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });
});

describe('GET /api/sessions (all sessions)', () => {
  it('Test H3: returns 200 JSON array with CORS header', async () => {
    const sessionId = 'http-all-sessions-001';
    persistEvent(db, makeSessionStartEventHttp(sessionId, '/workspace/all-sessions'));

    const { status, body, headers } = await httpGetJson(port, '/api/sessions');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    const sessions = body as Array<{ sessionId: string }>;
    expect(sessions.some((s) => s.sessionId === sessionId)).toBe(true);
    expect(headers['access-control-allow-origin']).toBe('*');
  });
});

describe('GET /api/sessions/:id/summary', () => {
  it('Test H4: returns 200 JSON object for known session', async () => {
    const sessionId = 'http-summary-known-001';
    persistEvent(db, makeSessionStartEventHttp(sessionId, '/workspace/known'));

    const { status, body, headers } = await httpGetJson(port, `/api/sessions/${sessionId}/summary`);
    expect(status).toBe(200);
    const summary = body as { sessionId: string; provider: string; workspacePath: string };
    expect(summary.sessionId).toBe(sessionId);
    expect(summary.provider).toBe('claude');
    expect(summary.workspacePath).toBe('/workspace/known');
    expect(headers['access-control-allow-origin']).toBe('*');
  });

  it('Test H5: returns 404 for unknown session', async () => {
    const { status, headers } = await httpGetJson(port, '/api/sessions/no-such-session-xyz/summary');
    expect(status).toBe(404);
    expect(headers['access-control-allow-origin']).toBe('*');
  });
});

describe('DELETE /api/sessions', () => {
  it('Test H6: deletes ended sessions and removes them from list', async () => {
    const sessionId = 'http-delete-ended-001';
    const now = new Date().toISOString();
    persistEvent(db, {
      schemaVersion: 1,
      sessionId,
      timestamp: now,
      type: 'session_start',
      provider: 'claude',
      workspacePath: '/workspace/delete-ended',
    } as NormalizedEvent);
    persistEvent(db, {
      schemaVersion: 1,
      sessionId,
      timestamp: new Date(Date.now() + 1000).toISOString(),
      type: 'session_end',
      provider: 'claude',
    } as NormalizedEvent);

    const del = await httpJson(port, 'DELETE', '/api/sessions', {
      sessionIds: [sessionId],
      terminateActive: false,
    });
    expect(del.status).toBe(200);
    const payload = del.body as { deletedSessionIds: string[]; skipped: Array<{ sessionId: string }> };
    expect(payload.deletedSessionIds).toEqual([sessionId]);
    expect(payload.skipped).toEqual([]);

    const { body } = await httpGetJson(port, '/api/sessions');
    const sessions = body as Array<{ sessionId: string }>;
    expect(sessions.some((s) => s.sessionId === sessionId)).toBe(false);
  });

  it('Test H7: skips active session when terminateActive=false', async () => {
    const sessionId = 'http-delete-active-001';
    persistEvent(db, {
      schemaVersion: 1,
      sessionId,
      timestamp: new Date().toISOString(),
      type: 'session_start',
      provider: 'claude',
      workspacePath: '/workspace/delete-active',
      managedByDaemon: false,
      canTerminateSession: false,
      reason: 'External session is approval-only; chat send and terminate are disabled.',
    } as NormalizedEvent);

    const del = await httpJson(port, 'DELETE', '/api/sessions', {
      sessionIds: [sessionId],
      terminateActive: false,
    });
    expect(del.status).toBe(200);
    const payload = del.body as {
      deletedSessionIds: string[];
      skipped: Array<{ sessionId: string; reason: string }>;
    };
    expect(payload.deletedSessionIds).toEqual([]);
    expect(payload.skipped.some((s) => s.sessionId === sessionId)).toBe(true);
  });
});
