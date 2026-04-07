import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createWsServer } from '../ws/server.js';
import { openDatabase } from '../db/database.js';
import { persistEvent } from '../db/queries.js';
import { getWorkspacePath } from '../memory/memoryReader.js';
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
