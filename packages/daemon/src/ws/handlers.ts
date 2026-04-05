import { WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type Database from 'better-sqlite3';
import { getEventsSince } from '../db/queries.js';

export function handleConnection(
  ws: WebSocket,
  req: IncomingMessage,
  db: Database.Database,
): void {
  // Parse lastSeenSequence from URL query string
  // Protocol definition: lastSeenSequence is the sequence_number of the LAST event
  // the client has already received. Query is strictly > lastSeenSequence.
  // Default 0 = "send all events" (first connection).
  const url = new URL(req.url ?? '/', 'http://localhost');
  const lastSeenSequence = parseInt(url.searchParams.get('lastSeenSequence') ?? '0', 10);

  // Catch-up replay: runs synchronously (better-sqlite3 is sync + Node is single-threaded)
  // This loop completes atomically before any new event can arrive via eventBus.
  // No async gaps allowed here — do not add await or setImmediate inside this loop.
  const missed = getEventsSince(db, lastSeenSequence);

  for (const event of missed) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  ws.on('message', (_data) => {
    // Phase 1: no inbound messages processed (approval decisions come in Phase 2)
  });

  ws.on('error', (err) => {
    console.error('[cockpit-daemon] WebSocket client error:', err.message);
  });

  ws.on('close', () => {
    // no-op for Phase 1
  });
}
