import { openDatabase, initializeClaudeSessionCache } from './db/database.js';
import { persistEvent, getStartedSessionIds, backfillSessionStarts, getOrphanedSessionIds } from './db/queries.js';
import { createWsServer, broadcast } from './ws/server.js';
import { createHookServer, initStartedSessions } from './adapters/claude/hookServer.js';
import { setClaudeSessionCache, setClaudeSessionDb } from './adapters/claude/hookParser.js';
import { approvalQueue } from './approvals/approvalQueue.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';
import type { WebSocketServer } from 'ws';
import type Database from 'better-sqlite3';
import type http from 'node:http';

const DB_PATH = process.env['COCKPIT_DB_PATH'] ?? `${process.env['HOME']}/.local/share/agent-cockpit/events.db`;
const WS_PORT = parseInt(process.env['COCKPIT_WS_PORT'] ?? '3001', 10);
const HOOK_PORT = parseInt(process.env['COCKPIT_HOOK_PORT'] ?? '3002', 10);

const db = openDatabase(DB_PATH);

// Initialize Claude session ID cache from persisted table — must happen before hook server starts
const claudeSessionCache = initializeClaudeSessionCache(db);
setClaudeSessionCache(claudeSessionCache);
setClaudeSessionDb(db);

// Backfill session_start events for sessions in claude_sessions that lack one (idempotent)
backfillSessionStarts(db);

// Pre-populate started sessions so daemon restarts don't re-emit session_start for existing sessions
initStartedSessions(getStartedSessionIds(db));

// Hook server — started after DB and cache initialization, before WS
const hookServer = createHookServer(
  HOOK_PORT,
  (event) => eventBus.emit('event', event),
  (approvalId, event) => approvalQueue.register(approvalId, event, db),
  (approvalId) => approvalQueue.handleTimeout(approvalId, db),
);

hookServer.once('listening', () => {
  logger.info('daemon', 'Hook server listening', { port: HOOK_PORT });
});

const { wss, httpServer } = createWsServer(db, WS_PORT);

// Event pipeline: eventBus → persist → broadcast
eventBus.on('event', (rawEvent) => {
  logger.debug('daemon', `Event pipeline: ${rawEvent.type}`, { sessionId: rawEvent.sessionId });
  const saved = persistEvent(db, rawEvent);
  logger.debug('daemon', `Event persisted: seq=${(saved as { sequenceNumber?: number }).sequenceNumber}`, {
    type: saved.type,
    sessionId: saved.sessionId,
  });
  broadcast(wss, JSON.stringify(saved), db);
});

// Close orphaned sessions: sessions with session_start but no session_end and no activity in 2h
// Runs after eventBus is wired so the emitted events are persisted and broadcast
const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const orphaned = getOrphanedSessionIds(db, twoHoursAgo);
if (orphaned.length > 0) {
  logger.info('daemon', `Closing ${orphaned.length} orphaned session(s)`, { sessionIds: orphaned });
}
for (const sessionId of orphaned) {
  eventBus.emit('event', {
    schemaVersion: 1,
    sessionId,
    type: 'session_end',
    provider: 'claude',
    timestamp: new Date().toISOString(),
  } as import('@cockpit/shared').NormalizedEvent);
}

// Graceful shutdown
function shutdown(db: Database.Database, wss: WebSocketServer, hookServer: http.Server): void {
  logger.info('daemon', 'Shutting down...');
  // Terminate all open client connections before closing the server
  wss.clients.forEach((client) => client.terminate());
  wss.close(() => {
    hookServer.close(() => {
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
      httpServer.close(() => {
        process.exit(0);
      });
    });
  });
}

process.on('SIGTERM', () => shutdown(db, wss, hookServer));
process.on('SIGINT', () => shutdown(db, wss, hookServer));

httpServer.once('listening', () => {
  logger.info('daemon', 'Started', { db: DB_PATH, wsPort: WS_PORT, hookPort: HOOK_PORT });
});
