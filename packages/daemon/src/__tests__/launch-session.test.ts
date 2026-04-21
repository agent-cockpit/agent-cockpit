import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import { createWsServer } from '../ws/server.js';
import { openDatabase } from '../db/database.js';
import { persistEvent } from '../db/queries.js';
import { eventBus } from '../eventBus.js';
import type Database from 'better-sqlite3';
import type { NormalizedEvent } from '@cockpit/shared';
import { EventEmitter } from 'node:events';

// Module-level mock for child_process so we can control execFileSync behavior
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFileSync: vi.fn(actual.execFileSync),
    spawn: vi.fn((file: string) => {
      const proc = new EventEmitter() as unknown as {
        stdout: EventEmitter | null;
        stderr: EventEmitter | null;
        stdin: { writable: boolean; destroyed: boolean; write: ReturnType<typeof vi.fn> };
        kill: ReturnType<typeof vi.fn>;
        pid: number;
        killed: boolean;
        on: (event: string, cb: (...args: unknown[]) => void) => unknown;
        once: (event: string, cb: (...args: unknown[]) => void) => unknown;
        emit: (event: string, ...args: unknown[]) => boolean;
      };
      proc.stdout = file === 'codex' ? null : new EventEmitter();
      proc.stderr = file === 'codex' ? null : new EventEmitter();
      proc.stdin = {
        writable: true,
        destroyed: false,
        write: vi.fn(() => true),
      };
      proc.pid = 12345;
      proc.killed = false;
      proc.kill = vi.fn(() => {
        proc.killed = true;
        proc.emit('exit', 0, null);
        return true;
      });
      return proc;
    }),
  };
});

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

// Helper: make an HTTP GET request and return status + parsed JSON body + headers
function httpGetJson(port: number, path: string): Promise<{ status: number; body: unknown; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: 'localhost', port, path, method: 'GET' },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: raw ? JSON.parse(raw) : null,
            headers: res.headers,
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

// Helper: valid NormalizedEvent for seeding
function makeSessionEvent(sessionId: string, overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    schemaVersion: 1,
    sessionId,
    timestamp: new Date().toISOString(),
    type: 'session_start',
    provider: 'claude',
    workspacePath: '/home/user/project',
    ...overrides,
  } as NormalizedEvent;
}

let db: Database.Database;
let httpServer: http.Server;
let port: number;
let eventPersistListener: ((event: NormalizedEvent) => void) | null = null;

beforeEach(async () => {
  db = openDatabase(':memory:');
  eventPersistListener = (event) => {
    persistEvent(db, event);
  };
  eventBus.on('event', eventPersistListener);
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
  if (eventPersistListener) {
    eventBus.off('event', eventPersistListener);
    eventPersistListener = null;
  }
  db.close();
  vi.restoreAllMocks();
});

describe('POST /api/sessions', () => {
  it('returns 200 with { sessionId, mode: "initiated" } for Claude (no hookCommand)', async () => {
    const { status, data } = await httpPost(port, '/api/sessions', {
      provider: 'claude',
      workspacePath: '/tmp',
    });
    expect(status).toBe(200);
    expect(typeof data.sessionId).toBe('string');
    expect(data.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.mode).toBe('initiated');
    expect(data.hookCommand).toBeUndefined();
  });

  it('persists session_start immediately for daemon-launched Claude sessions', async () => {
    const { status, data } = await httpPost(port, '/api/sessions', {
      provider: 'claude',
      workspacePath: '/tmp',
    });

    expect(status).toBe(200);
    const sessionId = data.sessionId as string;

    const events = db.prepare(
      'SELECT type, payload FROM events WHERE session_id = ? ORDER BY sequence_number ASC',
    ).all(sessionId) as Array<{ type: string; payload: string }>;

    expect(events.some((event) => event.type === 'session_start')).toBe(true);
    const startEvent = events.find((event) => event.type === 'session_start');
    expect(startEvent).toBeDefined();
    const payload = JSON.parse(startEvent!.payload) as {
      workspacePath: string;
      managedByDaemon: boolean;
      canSendMessage: boolean;
      canTerminateSession: boolean;
    };
    expect(payload.workspacePath).toBe('/tmp');
    expect(payload.managedByDaemon).toBe(true);
    expect(payload.canSendMessage).toBe(true);
    expect(payload.canTerminateSession).toBe(true);
  });

  it('returns 200 with { sessionId, mode: "initiated" } for Codex', async () => {
    const { status, data } = await httpPost(port, '/api/sessions', {
      provider: 'codex',
      workspacePath: '/tmp',
    });
    expect(status).toBe(200);
    expect(typeof data.sessionId).toBe('string');
    expect(data.mode).toBe('initiated');
  });

  it('returns 400 for missing workspacePath', async () => {
    const { status } = await httpPost(port, '/api/sessions', {
      provider: 'claude',
    });
    expect(status).toBe(400);
  });

  it('returns 400 for missing provider', async () => {
    const { status } = await httpPost(port, '/api/sessions', {
      workspacePath: '/tmp',
    });
    expect(status).toBe(400);
  });

  it('returns 422 with error_code INVALID_WORKSPACE for non-existent workspacePath', async () => {
    const { status, data } = await httpPost(port, '/api/sessions', {
      provider: 'claude',
      workspacePath: '/nonexistent/path/that/does/not/exist',
    });
    expect(status).toBe(422);
    expect(data.error_code).toBe('INVALID_WORKSPACE');
    expect(typeof data.error).toBe('string');
  });

  it('returns 422 with error_code INVALID_WORKSPACE for codex with non-existent workspacePath', async () => {
    const { status, data } = await httpPost(port, '/api/sessions', {
      provider: 'codex',
      workspacePath: '/nonexistent/path/that/does/not/exist',
    });
    expect(status).toBe(422);
    expect(data.error_code).toBe('INVALID_WORKSPACE');
    expect(typeof data.error).toBe('string');
  });
});

describe('ClaudeLauncher preflight', () => {
  it('throws LaunchError with code MISSING_BINARY when claude binary is absent', async () => {
    const { ClaudeLauncher, LaunchError } = await import('../adapters/claude/claudeLauncher.js');
    const cp = await import('node:child_process');
    // Override the mocked execFileSync to simulate missing binary
    vi.mocked(cp.execFileSync).mockImplementationOnce(() => { throw new Error('not found'); });
    const launcher = new ClaudeLauncher(3002);
    await expect(launcher.preflight('/tmp')).rejects.toThrow(LaunchError);
  });

  it('preflight throws LaunchError code MISSING_BINARY (code field check)', async () => {
    const { ClaudeLauncher, LaunchError } = await import('../adapters/claude/claudeLauncher.js');
    const cp = await import('node:child_process');
    vi.mocked(cp.execFileSync).mockImplementationOnce(() => { throw new Error('not found'); });
    const launcher = new ClaudeLauncher(3002);
    let caught: unknown;
    try {
      await launcher.preflight('/tmp');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(LaunchError);
    expect((caught as InstanceType<typeof LaunchError>).code).toBe('MISSING_BINARY');
  });
});

describe('Other HTTP routes', () => {
  it('GET /api/sessions returns 200 JSON array (history endpoint added in Plan 02)', async () => {
    const { status } = await httpGet(port, '/api/sessions');
    expect(status).toBe(200);
  });
});

describe('GET /api/sessions/:sessionId/events', () => {
  it('returns 200 with Content-Type application/json', async () => {
    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000001';
    const { status, headers } = await httpGetJson(port, `/api/sessions/${sessionId}/events`);
    expect(status).toBe(200);
    expect(headers['content-type']).toBe('application/json');
  });

  it('response body is a JSON array of events matching only the requested sessionId', async () => {
    const sessionA = 'aaaaaaaa-0000-0000-0000-000000000002';
    const sessionB = 'bbbbbbbb-0000-0000-0000-000000000002';
    persistEvent(db, makeSessionEvent(sessionA));
    persistEvent(db, makeSessionEvent(sessionB));
    persistEvent(db, makeSessionEvent(sessionA));
    const { status, body } = await httpGetJson(port, `/api/sessions/${sessionA}/events`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    const events = body as Array<{ sessionId: string }>;
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.sessionId === sessionA)).toBe(true);
  });

  it('events in response are ordered by sequenceNumber ASC', async () => {
    const sessionId = 'cccccccc-0000-0000-0000-000000000003';
    persistEvent(db, makeSessionEvent(sessionId));
    persistEvent(db, makeSessionEvent(sessionId));
    persistEvent(db, makeSessionEvent(sessionId));
    const { body } = await httpGetJson(port, `/api/sessions/${sessionId}/events`);
    const events = body as Array<{ sequenceNumber: number }>;
    const sequences = events.map((e) => e.sequenceNumber);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
  });

  it('returns 200 with empty array for unknown sessionId', async () => {
    const { status, body } = await httpGetJson(port, '/api/sessions/unknown-id/events');
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it('Access-Control-Allow-Methods response header includes GET', async () => {
    const sessionId = 'eeeeeeee-0000-0000-0000-000000000005';
    const { headers } = await httpGetJson(port, `/api/sessions/${sessionId}/events`);
    expect(headers['access-control-allow-methods']).toContain('GET');
  });
});
