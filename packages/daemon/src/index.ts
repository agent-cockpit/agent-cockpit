import { openDatabase, initializeClaudeSessionCache } from './db/database.js';
import { persistEvent, getStartedSessionIds, backfillSessionStarts, getOrphanedSessionIds } from './db/queries.js';
import { createWsServer, broadcast } from './ws/server.js';
import { createHookServer, initStartedSessions } from './adapters/claude/hookServer.js';
import { setClaudeSessionCache, setClaudeSessionDb } from './adapters/claude/hookParser.js';
import { approvalQueue } from './approvals/approvalQueue.js';
import { getAllPendingApprovals } from './approvals/approvalStore.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';
import { ingestExternalCodexCliSessions } from './adapters/codex/externalSessionIngest.js'
import { ingestExternalClaudeSessions } from './adapters/claude/externalSessionIngest.js';
import type { WebSocketServer } from 'ws';
import type Database from 'better-sqlite3';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';

function resolveDefaultDataDir(): string {
  const explicit = process.env['COCKPIT_DATA_DIR']?.trim();
  if (explicit) return explicit;

  const homeDir = os.homedir();
  if (process.platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA']?.trim();
    if (localAppData) return path.join(localAppData, 'agent-cockpit');
    return path.join(homeDir, 'AppData', 'Local', 'agent-cockpit');
  }
  if (process.platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'agent-cockpit');
  }

  const xdgDataHome = process.env['XDG_DATA_HOME']?.trim();
  if (xdgDataHome) return path.join(xdgDataHome, 'agent-cockpit');
  return path.join(homeDir, '.local', 'share', 'agent-cockpit');
}

const DB_PATH = process.env['COCKPIT_DB_PATH'] ?? path.join(resolveDefaultDataDir(), 'events.db');
const WS_PORT = parseInt(process.env['COCKPIT_WS_PORT'] ?? '3001', 10);
const HOOK_PORT = parseInt(process.env['COCKPIT_HOOK_PORT'] ?? '3002', 10);
const CODEX_EXTERNAL_POLL_MS = parseInt(process.env['COCKPIT_CODEX_EXTERNAL_POLL_MS'] ?? '5000', 10);
const CLAUDE_EXTERNAL_POLL_MS = parseInt(process.env['COCKPIT_CLAUDE_EXTERNAL_POLL_MS'] ?? '5000', 10);

const db = openDatabase(DB_PATH);
let shuttingDown = false;

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

// Event pipeline: eventBus → persist → broadcast.
// Must be wired before stale approval expiry so approval_resolved events are persisted.
eventBus.on('event', (rawEvent) => {
  logger.debug('daemon', `Event pipeline: ${rawEvent.type}`, { sessionId: rawEvent.sessionId });
  const saved = persistEvent(db, rawEvent);
  logger.debug('daemon', `Event persisted: seq=${(saved as { sequenceNumber?: number }).sequenceNumber}`, {
    type: saved.type,
    sessionId: saved.sessionId,
  });
  broadcast(wss, JSON.stringify(saved), db);
});

// Expire approvals that were pending when the daemon last stopped.
// Runs after eventBus listener is wired so approval_resolved events are persisted and replayed.
const stale = getAllPendingApprovals(db);
if (stale.length > 0) {
  logger.info('daemon', `Expiring ${stale.length} stale pending approval(s) from previous run`);
  for (const row of stale) {
    approvalQueue.handleTimeout(row.approvalId, db);
  }
}

function importExternalCodexSessions(): void {
  try {
    const imported = ingestExternalCodexCliSessions(db, (event) => eventBus.emit('event', event));
    if (imported > 0) {
      logger.info('codex-external', 'Imported external Codex CLI sessions', { imported });
    }
  } catch (err) {
    logger.warn('codex-external', 'Failed to import external Codex CLI sessions', { error: String(err) });
  }
}

// Prime external Codex CLI sessions once at startup so they appear in UI history/state.
importExternalCodexSessions();

const codexExternalPollTimer =
  Number.isFinite(CODEX_EXTERNAL_POLL_MS) && CODEX_EXTERNAL_POLL_MS > 0
    ? setInterval(importExternalCodexSessions, CODEX_EXTERNAL_POLL_MS)
    : null;
codexExternalPollTimer?.unref();

function importExternalClaudeSessions(): void {
  try {
    const imported = ingestExternalClaudeSessions(db, (event) => eventBus.emit('event', event));
    if (imported > 0) {
      logger.info('claude-external', 'Imported external Claude sessions', { imported });
    }
  } catch (err) {
    logger.warn('claude-external', 'Failed to import external Claude sessions', { error: String(err) });
  }
}

importExternalClaudeSessions();

const claudeExternalPollTimer =
  Number.isFinite(CLAUDE_EXTERNAL_POLL_MS) && CLAUDE_EXTERNAL_POLL_MS > 0
    ? setInterval(importExternalClaudeSessions, CLAUDE_EXTERNAL_POLL_MS)
    : null;
claudeExternalPollTimer?.unref();

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
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('daemon', 'Shutting down...');
  if (codexExternalPollTimer) clearInterval(codexExternalPollTimer);
  if (claudeExternalPollTimer) clearInterval(claudeExternalPollTimer);
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
