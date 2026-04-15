import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { openDatabase } from '../db/database.js';
import { persistEvent } from '../db/queries.js';
import { handleConnection } from '../ws/handlers.js';
import { broadcast } from '../ws/server.js';
import type { NormalizedEvent } from '@cockpit/shared';
import type { Database } from 'better-sqlite3';

interface CatchupCompleteMessage {
  type: 'catchup_complete'
  lastSeenSequence: number
  latestSequenceNumber: number
}

function isCatchupCompleteMessage(value: unknown): value is CatchupCompleteMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as Record<string, unknown>;
  return (
    msg['type'] === 'catchup_complete' &&
    typeof msg['lastSeenSequence'] === 'number' &&
    typeof msg['latestSequenceNumber'] === 'number'
  );
}

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
): Promise<{ events: NormalizedEvent[]; controls: CatchupCompleteMessage[] }> {
  return new Promise((resolve, reject) => {
    const events: NormalizedEvent[] = [];
    const controls: CatchupCompleteMessage[] = [];
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      resolve({ events, controls }); // return what we have (may be fewer than expected)
    }, timeoutMs);

    ws.on('message', (data) => {
      const parsed = JSON.parse(data.toString()) as unknown;
      if (isCatchupCompleteMessage(parsed)) {
        controls.push(parsed);
      } else {
        events.push(parsed as NormalizedEvent);
      }
      if (
        events.length >= expectedCount &&
        (expectedCount > 0 || controls.length > 0)
      ) {
        clearTimeout(timer);
        ws.close();
        resolve({ events, controls });
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
    expect(messages.events).toHaveLength(3);
    expect(messages.controls).toHaveLength(1);
  });

  it('delivers only missed events to client with lastSeenSequence=1', async () => {
    const e1 = persistEvent(db, makeEvent());
    persistEvent(db, makeEvent());
    persistEvent(db, makeEvent());

    const messages = await connectAndCollect(
      `ws://localhost:${port}?lastSeenSequence=${e1.sequenceNumber}`,
      2
    );
    expect(messages.events).toHaveLength(2);
    expect(messages.controls).toHaveLength(1);
    // First message should have sequenceNumber = e1.sequenceNumber + 1
    expect(messages.events[0]!.sequenceNumber).toBe((e1.sequenceNumber ?? 0) + 1);
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
    expect(messages.events).toHaveLength(0);
    expect(messages.controls).toHaveLength(1);
  });

  it('delivers catch-up events in ascending sequence_number order', async () => {
    persistEvent(db, makeEvent());
    persistEvent(db, makeEvent());
    persistEvent(db, makeEvent());

    const messages = await connectAndCollect(
      `ws://localhost:${port}?lastSeenSequence=0`,
      3
    );
    const seqs = messages.events.map((m) => m.sequenceNumber ?? 0);
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
    expect(messages.events).toHaveLength(1);
    expect(messages.events[0]!.type).toBe('session_start');
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
    expect(m1.events).toHaveLength(1);
    expect(m2.events).toHaveLength(1);
  });
});
