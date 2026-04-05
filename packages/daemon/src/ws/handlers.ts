import { WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type Database from 'better-sqlite3';
import { getEventsSince } from '../db/queries.js';
import { approvalQueue } from '../approvals/approvalQueue.js';

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

  ws.on('message', (data) => {
    let msg: unknown;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    const m = msg as Record<string, unknown>;
    if (m['type'] === 'approval_decision') {
      const approvalId = m['approvalId'];
      const decision = m['decision'];
      if (
        typeof approvalId === 'string' &&
        (decision === 'approve' || decision === 'deny' || decision === 'always_allow')
      ) {
        approvalQueue.decide(approvalId, decision, db);
      }
    }
  });

  ws.on('error', (err) => {
    console.error('[cockpit-daemon] WebSocket client error:', err.message);
  });

  ws.on('close', () => {
    // no-op for Phase 1
  });
}
