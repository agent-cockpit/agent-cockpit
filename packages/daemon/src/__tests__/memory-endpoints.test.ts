import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createWsServer, broadcast } from '../ws/server.js';
import { openDatabase } from '../db/database.js';
import { persistEvent } from '../db/queries.js';
import { getWorkspacePath, resolveAutoMemoryPath } from '../memory/memoryReader.js';
import type Database from 'better-sqlite3';
import type { NormalizedEvent } from '@cockpit/shared';

// ---- HTTP helpers ----

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

function httpPutJson(
  port: number,
  urlPath: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: 'localhost', port, path: urlPath, method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : null }));
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function httpPostJson(
  port: number,
  urlPath: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: 'localhost', port, path: urlPath, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : null }));
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function httpDelete(
  port: number,
  urlPath: string,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: 'localhost', port, path: urlPath, method: 'DELETE' },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : null }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function httpOptions(port: number, urlPath: string): Promise<{ status: number; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: 'localhost', port, path: urlPath, method: 'OPTIONS' },
      (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

// ---- Test helpers ----

function makeSessionStartEvent(sessionId: string, workspacePath: string): NormalizedEvent {
  return {
    schemaVersion: 1,
    sessionId,
    timestamp: new Date().toISOString(),
    type: 'session_start',
    provider: 'claude',
    workspacePath,
  } as NormalizedEvent;
}

const tmpDirs: string[] = [];
function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-mem-ep-'));
  tmpDirs.push(dir);
  return dir;
}

// ---- Setup ----

let db: Database.Database;
let httpServer: http.Server;
let wss: import('ws').WebSocketServer;
let port: number;

beforeEach(async () => {
  db = openDatabase(':memory:');
  const server = createWsServer(db, 0);
  httpServer = server.httpServer;
  wss = server.wss;
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
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ---- getWorkspacePath unit tests ----

describe('getWorkspacePath', () => {
  it('returns workspacePath for a session that has a session_start event', () => {
    const sessionId = 'aaa-111';
    const workspace = '/home/user/myproject';
    persistEvent(db, makeSessionStartEvent(sessionId, workspace));
    expect(getWorkspacePath(db, sessionId)).toBe(workspace);
  });

  it('falls back to claude_sessions when session_start is missing', () => {
    const sessionId = 'claude-fallback-01';
    const workspace = '/home/user/claude-fallback';
    db.prepare(
      'INSERT INTO claude_sessions (session_id, claude_id, workspace, created_at) VALUES (?, ?, ?, ?)',
    ).run(sessionId, 'claude-native-id-01', workspace, new Date().toISOString());

    expect(getWorkspacePath(db, sessionId)).toBe(workspace);
  });

  it('falls back to codex_sessions when session_start is missing', () => {
    const sessionId = 'codex-fallback-01';
    const workspace = '/home/user/codex-fallback';
    db.prepare(
      'INSERT INTO codex_sessions (session_id, thread_id, workspace, created_at) VALUES (?, ?, ?, ?)',
    ).run(sessionId, 'thread-123', workspace, new Date().toISOString());

    expect(getWorkspacePath(db, sessionId)).toBe(workspace);
  });

  it('returns null for an unknown sessionId', () => {
    expect(getWorkspacePath(db, 'unknown-session')).toBeNull();
  });
});

// ---- GET /api/memory/:sessionId/claude-md ----

describe('GET /api/memory/:sessionId/claude-md', () => {
  it('returns 404 for an unknown sessionId', async () => {
    const { status } = await httpGetJson(port, '/api/memory/no-such-session/claude-md');
    expect(status).toBe(404);
  });

  it('returns {content, path} when CLAUDE.md exists', async () => {
    const workspace = makeTmpDir();
    const sessionId = 'sess-claude-01';
    persistEvent(db, makeSessionStartEvent(sessionId, workspace));

    const claudeMdPath = path.join(workspace, 'CLAUDE.md');
    fs.writeFileSync(claudeMdPath, '# My project', 'utf-8');

    const { status, body } = await httpGetJson(port, `/api/memory/${sessionId}/claude-md`);
    expect(status).toBe(200);
    const b = body as { content: string; path: string };
    expect(b.content).toBe('# My project');
    expect(b.path).toBe(claudeMdPath);
  });

  it('returns {content: null, path: null} when CLAUDE.md absent', async () => {
    const workspace = makeTmpDir();
    const sessionId = 'sess-claude-02';
    persistEvent(db, makeSessionStartEvent(sessionId, workspace));

    const { status, body } = await httpGetJson(port, `/api/memory/${sessionId}/claude-md`);
    expect(status).toBe(200);
    const b = body as { content: null; path: null };
    expect(b.content).toBeNull();
    expect(b.path).toBeNull();
  });
});

// ---- PUT /api/memory/:sessionId/claude-md ----

describe('PUT /api/memory/:sessionId/claude-md', () => {
  it('returns 404 for an unknown sessionId', async () => {
    const { status } = await httpPutJson(port, '/api/memory/no-such-session/claude-md', { content: 'hello' });
    expect(status).toBe(404);
  });

  it('writes content to disk and returns {ok: true}', async () => {
    const workspace = makeTmpDir();
    const sessionId = 'sess-claude-put-01';
    persistEvent(db, makeSessionStartEvent(sessionId, workspace));

    // Pre-create CLAUDE.md in workspace root so resolveClaudeMdPath returns it
    const claudeMdPath = path.join(workspace, 'CLAUDE.md');
    fs.writeFileSync(claudeMdPath, '# Original', 'utf-8');

    const { status, body } = await httpPutJson(port, `/api/memory/${sessionId}/claude-md`, { content: '# Updated' });
    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);

    const written = fs.readFileSync(claudeMdPath, 'utf-8');
    expect(written).toBe('# Updated');
  });
});

// ---- GET /api/memory/:sessionId/auto-memory ----

describe('GET /api/memory/:sessionId/auto-memory', () => {
  it('returns 404 for unknown sessionId', async () => {
    const { status } = await httpGetJson(port, '/api/memory/no-such-session/auto-memory');
    expect(status).toBe(404);
  });

  it('returns {content: null} when MEMORY.md absent', async () => {
    const workspace = makeTmpDir();
    const sessionId = 'sess-auto-01';
    persistEvent(db, makeSessionStartEvent(sessionId, workspace));

    const { status, body } = await httpGetJson(port, `/api/memory/${sessionId}/auto-memory`);
    expect(status).toBe(200);
    expect((body as { content: null }).content).toBeNull();
  });
});

// ---- CORS header includes PUT and DELETE ----

describe('CORS', () => {
  it('Access-Control-Allow-Methods includes PUT and DELETE', async () => {
    const { headers } = await httpOptions(port, '/api/memory/any/claude-md');
    const methods = headers['access-control-allow-methods'] ?? '';
    expect(methods).toContain('PUT');
    expect(methods).toContain('DELETE');
  });
});

// ---- Notes CRUD ----

describe('Notes CRUD endpoints', () => {
  it('POST /api/memory/notes creates a note and returns it with note_id', async () => {
    const workspace = '/test/workspace';
    const { status, body } = await httpPostJson(port, '/api/memory/notes', {
      workspace,
      content: 'Remember this',
      pinned: true,
    });
    expect(status).toBe(201);
    const note = body as { note_id: string; workspace: string; content: string; pinned: number };
    expect(note.note_id).toBeTruthy();
    expect(note.workspace).toBe(workspace);
    expect(note.content).toBe('Remember this');
    expect(note.pinned).toBe(1);
  });

  it('GET /api/memory/notes?workspace=X returns array of notes', async () => {
    const workspace = '/test/workspace-list';
    await httpPostJson(port, '/api/memory/notes', { workspace, content: 'Note 1' });
    await httpPostJson(port, '/api/memory/notes', { workspace, content: 'Note 2' });

    const { status, body } = await httpGetJson(port, `/api/memory/notes?workspace=${encodeURIComponent(workspace)}`);
    expect(status).toBe(200);
    const notes = body as Array<{ content: string }>;
    expect(notes).toHaveLength(2);
  });

  it('GET /api/memory/notes returns empty array for unknown workspace', async () => {
    const { status, body } = await httpGetJson(port, '/api/memory/notes?workspace=/no/such/workspace');
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it('DELETE /api/memory/notes/:noteId removes note and returns {ok: true}', async () => {
    const workspace = '/test/workspace-delete';
    const createResult = await httpPostJson(port, '/api/memory/notes', { workspace, content: 'To delete' });
    const note = createResult.body as { note_id: string };

    const { status, body } = await httpDelete(port, `/api/memory/notes/${note.note_id}`);
    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);

    // Verify it's gone
    const { body: listBody } = await httpGetJson(port, `/api/memory/notes?workspace=${encodeURIComponent(workspace)}`);
    expect(listBody).toEqual([]);
  });

  it('POST /api/memory/notes returns 400 when workspace missing', async () => {
    const { status } = await httpPostJson(port, '/api/memory/notes', { content: 'No workspace' });
    expect(status).toBe(400);
  });
});

// ---- Suggestions ----

describe('Suggestions approve/reject', () => {
  it('DELETE /api/memory/suggestions/:id returns {ok: true} even if id unknown', async () => {
    const { status, body } = await httpDelete(port, '/api/memory/suggestions/some-key');
    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);
  });

  it('POST /api/memory/suggestions/:id/approve returns 404 when suggestion not registered', async () => {
    const { status } = await httpPostJson(port, '/api/memory/suggestions/nonexistent-key/approve', {});
    expect(status).toBe(404);
  });

  it('approve performs real disk write — appends suggestion value to MEMORY.md', async () => {
    const workspace = makeTmpDir();
    const sessionId = 'sess-suggest-01';
    persistEvent(db, makeSessionStartEvent(sessionId, workspace));

    // Pre-create MEMORY.md at the auto-memory path
    const memoryPath = resolveAutoMemoryPath(workspace);
    fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
    fs.writeFileSync(memoryPath, '# Memory\n\nExisting content', 'utf-8');

    // Populate pendingSuggestions by calling broadcast with a memory_write event
    const memoryKey = 'test-suggestion-key';
    const suggestionValue = '- New remembered fact';
    broadcast(wss, JSON.stringify({
      type: 'memory_write',
      suggested: true,
      sessionId,
      memoryKey,
      value: suggestionValue,
    }), db);

    // Approve the suggestion
    const { status, body } = await httpPostJson(port, `/api/memory/suggestions/${encodeURIComponent(memoryKey)}/approve`, {});
    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);

    // Verify disk was actually written
    const written = fs.readFileSync(memoryPath, 'utf-8');
    expect(written).toContain('Existing content');
    expect(written).toContain(suggestionValue);
    expect(written.indexOf('Existing content')).toBeLessThan(written.indexOf(suggestionValue));
  });
});
