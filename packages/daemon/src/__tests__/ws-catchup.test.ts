import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { openDatabase } from '../db/database.js';
import { persistEvent } from '../db/queries.js';
import { handleConnection } from '../ws/handlers.js';
import { broadcast } from '../ws/server.js';
import type { NormalizedEvent } from '@cockpit/shared';
import type { Database } from 'better-sqlite3';

// Helper
function makeEvent(sessionId = '123e4567-e89b-12d3-a456-426614174000'): NormalizedEvent {
  return {
    schemaVersion: 1,
    sessionId,
    timestamp: new Date().toISOString(),
    type: 'session_start',
    provider: 'claude',
    workspacePath: '/test',
  } as NormalizedEvent;
}

// Connect a WebSocket client to the given URL and collect messages
function connectAndCollect(
  url: string,
  expectedCount: number,
  timeoutMs = 2000,
): Promise<NormalizedEvent[]> {
  return new Promise((resolve, reject) => {
    const messages: NormalizedEvent[] = [];
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      resolve(messages); // return what we have (may be fewer than expected)
    }, timeoutMs);

    ws.on('message', (data) => {
      messages.push(JSON.parse(data.toString()) as NormalizedEvent);
      if (messages.length >= expectedCount) {
        clearTimeout(timer);
        ws.close();
        resolve(messages);
      }
    });

    ws.on('error', reject);
  });
}

let db: InstanceType<typeof import('better-sqlite3').default>;
let wss: WebSocketServer;
let httpServer: ReturnType<typeof createServer>;
let port: number;

beforeEach(() => {
  db = openDatabase(':memory:');
  httpServer = createServer();
  wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws, req) => {
    handleConnection(ws, req, db);
  });

  return new Promise<void>((resolve) => {
    httpServer.listen(0, () => {
      port = (httpServer.address() as { port: number }).port;
      resolve();
    });
  });
});

afterEach(() => {
  return new Promise<void>((resolve) => {
    wss.close(() => {
      httpServer.close(() => {
        db.close();
        resolve();
      });
    });
  });
});

describe('WebSocket catch-up protocol', () => {
  it('delivers all events to client with lastSeenSequence=0', async () => {
    persistEvent(db, makeEvent());
    persistEvent(db, makeEvent());
    persistEvent(db, makeEvent());

    const messages = await connectAndCollect(
      `ws://localhost:${port}?lastSeenSequence=0`,
      3
    );
    expect(messages).toHaveLength(3);
  });

  it('delivers only missed events to client with lastSeenSequence=1', async () => {
    const e1 = persistEvent(db, makeEvent());
    persistEvent(db, makeEvent());
    persistEvent(db, makeEvent());

    const messages = await connectAndCollect(
      `ws://localhost:${port}?lastSeenSequence=${e1.sequenceNumber}`,
      2
    );
    expect(messages).toHaveLength(2);
    // First message should have sequenceNumber = e1.sequenceNumber + 1
    expect(messages[0]!.sequenceNumber).toBe((e1.sequenceNumber ?? 0) + 1);
  });

  it('delivers zero events when client is fully caught up', async () => {
    persistEvent(db, makeEvent());
    persistEvent(db, makeEvent());
    const e3 = persistEvent(db, makeEvent());

    const messages = await connectAndCollect(
      `ws://localhost:${port}?lastSeenSequence=${e3.sequenceNumber}`,
      0,
      300 // short timeout — we expect nothing
    );
    expect(messages).toHaveLength(0);
  });

  it('delivers catch-up events in ascending sequence_number order', async () => {
    persistEvent(db, makeEvent());
    persistEvent(db, makeEvent());
    persistEvent(db, makeEvent());

    const messages = await connectAndCollect(
      `ws://localhost:${port}?lastSeenSequence=0`,
      3
    );
    const seqs = messages.map((m) => m.sequenceNumber ?? 0);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });

  it('broadcasts live events to connected clients', async () => {
    // Connect first — no backlog
    const messagePromise = connectAndCollect(
      `ws://localhost:${port}?lastSeenSequence=0`,
      1
    );

    // Wait a tick for connection to establish, then inject a live event
    await new Promise((r) => setTimeout(r, 50));
    const event = persistEvent(db, makeEvent());
    broadcast(wss, JSON.stringify(event));

    const messages = await messagePromise;
    expect(messages).toHaveLength(1);
    expect(messages[0]!.type).toBe('session_start');
  });
});

describe('broadcast helper', () => {
  it('sends to all OPEN clients', async () => {
    // Connect two clients
    const p1 = connectAndCollect(`ws://localhost:${port}?lastSeenSequence=9999`, 1, 1000);
    const p2 = connectAndCollect(`ws://localhost:${port}?lastSeenSequence=9999`, 1, 1000);

    await new Promise((r) => setTimeout(r, 80));

    const payload = JSON.stringify({ type: 'session_start', schemaVersion: 1 });
    broadcast(wss, payload);

    const [m1, m2] = await Promise.all([p1, p2]);
    expect(m1).toHaveLength(1);
    expect(m2).toHaveLength(1);
  });
});
