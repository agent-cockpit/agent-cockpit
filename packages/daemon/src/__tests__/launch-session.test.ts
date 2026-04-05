import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { createWsServer } from '../ws/server.js';
import { openDatabase } from '../db/database.js';
import type Database from 'better-sqlite3';

// Helper: make an HTTP POST request and return status + parsed JSON body
function httpPost(port: number, path: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      { hostname: 'localhost', port, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) as Record<string, unknown> }));
        res.resume();
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Helper: make an HTTP GET request and return status
function httpGet(port: number, path: string): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: 'localhost', port, path, method: 'GET' },
      (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

let db: Database.Database;
let httpServer: http.Server;
let port: number;

beforeEach(async () => {
  db = openDatabase(':memory:');
  const server = createWsServer(db, 0); // port 0 = OS picks available port
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

describe('POST /api/sessions', () => {
  it('returns 200 with { sessionId, hookCommand } for Claude', async () => {
    const { status, data } = await httpPost(port, '/api/sessions', {
      provider: 'claude',
      workspacePath: '/tmp/test',
    });
    expect(status).toBe(200);
    expect(typeof data.sessionId).toBe('string');
    expect(data.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof data.hookCommand).toBe('string');
    expect(data.mode).toBe('configure-and-copy');
  });

  it('returns 200 with { sessionId } for Codex', async () => {
    const { status, data } = await httpPost(port, '/api/sessions', {
      provider: 'codex',
      workspacePath: '/tmp/test',
    });
    expect(status).toBe(200);
    expect(typeof data.sessionId).toBe('string');
    expect(data.mode).toBe('spawn');
  });

  it('returns 400 for missing workspacePath', async () => {
    const { status } = await httpPost(port, '/api/sessions', {
      provider: 'claude',
    });
    expect(status).toBe(400);
  });

  it('returns 400 for missing provider', async () => {
    const { status } = await httpPost(port, '/api/sessions', {
      workspacePath: '/tmp/test',
    });
    expect(status).toBe(400);
  });

  it('hookCommand for Claude includes the COCKPIT_HOOK_PORT value', async () => {
    process.env['COCKPIT_HOOK_PORT'] = '9999';
    const { data } = await httpPost(port, '/api/sessions', {
      provider: 'claude',
      workspacePath: '/tmp/test',
    });
    expect(data.hookCommand as string).toContain('9999');
    delete process.env['COCKPIT_HOOK_PORT'];
  });
});

describe('Other HTTP routes', () => {
  it('GET /api/sessions returns 404', async () => {
    const { status } = await httpGet(port, '/api/sessions');
    expect(status).toBe(404);
  });
});
