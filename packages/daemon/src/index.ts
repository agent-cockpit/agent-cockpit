import { openDatabase, initializeClaudeSessionCache } from './db/database.js';
import {
  persistEvent,
  getStartedSessionIds,
  backfillSessionStarts,
  getOrphanedSessionIds,
  getAllSessions,
  getLatestSessionUsageSnapshot,
  shouldPersistEvent,
  cleanupDuplicateRecords,
} from './db/queries.js';
import { createWsServer, broadcast } from './ws/server.js';
import { createHookServer, initStartedSessions } from './adapters/claude/hookServer.js';
import { setClaudeSessionCache, setClaudeSessionDb } from './adapters/claude/hookParser.js';
import { approvalQueue } from './approvals/approvalQueue.js';
import { getAllPendingApprovals } from './approvals/approvalStore.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';
import { ingestExternalCodexCliSessions } from './adapters/codex/externalSessionIngest.js'
import { ingestExternalClaudeSessions, importAllExternalClaudeTranscripts, getAliveExternalClaudeSessions } from './adapters/claude/externalSessionIngest.js';
import {
  areClaudeUsageSnapshotsEqual,
  readClaudeTranscriptUsage,
  toClaudeTranscriptUsageEvent,
} from './adapters/claude/transcriptUsage.js';
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
const WS_PORT = parseInt(process.env['COCKPIT_WS_PORT'] ?? '54321', 10);
const HOOK_PORT = parseInt(process.env['COCKPIT_HOOK_PORT'] ?? '54322', 10);
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

const cleanup = cleanupDuplicateRecords(db);
if (
  cleanup.deletedSessionStartEvents > 0 ||
  cleanup.deletedApprovalRequestEvents > 0 ||
  cleanup.deletedPendingApprovals > 0
) {
  logger.info('daemon', 'Removed duplicate historical records', cleanup);
}

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

const { wss, httpServer, resumeClaudeSession, runtimeRegistry } = createWsServer(db, WS_PORT, HOOK_PORT);

// Tracks external sessions for which a cockpit PTY auto-resume has been attempted.
// Prevents re-spawning on every poll iteration.
const autoResumeAttempted = new Set<string>()

// Event pipeline: eventBus → persist → broadcast.
// Must be wired before stale approval expiry so approval_resolved events are persisted.
eventBus.on('event', (rawEvent) => {
  logger.debug('daemon', `Event pipeline: ${rawEvent.type}`, { sessionId: rawEvent.sessionId });
  const dedupe = shouldPersistEvent(db, rawEvent);
  if (!dedupe.shouldPersist) {
    logger.info('daemon', 'Duplicate event suppressed', {
      type: rawEvent.type,
      sessionId: rawEvent.sessionId,
      reason: dedupe.reason,
    });
    return;
  }
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
    const imported = ingestExternalClaudeSessions(db, (event) => eventBus.emit('event', event), {
      isSessionManagedByCockpit: (cockpitId) => runtimeRegistry.has(cockpitId),
    });
    if (imported > 0) {
      logger.info('claude-external', 'Imported external Claude sessions', { imported });
    }

    // Import transcript history; incremental after first run (new records broadcast in real-time)
    const transcriptEvents = importAllExternalClaudeTranscripts(db, (event) => eventBus.emit('event', event));
    if (transcriptEvents > 0) {
      logger.info('claude-external', 'Imported transcript history from external Claude sessions', { events: transcriptEvents });
    }

    // Auto-resume: migrate each alive external session into a cockpit PTY.
    // Kill the external process first so claude --resume doesn't conflict, then resume after a
    // short delay so the process has time to release the session file lock.
    const aliveSessions = getAliveExternalClaudeSessions(db);
    for (const session of aliveSessions) {
      if (runtimeRegistry.has(session.cockpitId)) continue;
      if (autoResumeAttempted.has(session.cockpitId)) continue;
      autoResumeAttempted.add(session.cockpitId);

      logger.info('claude-external', 'Migrating external Claude session into cockpit PTY', {
        cockpitId: session.cockpitId,
        claudeId: session.claudeSessionId,
        pid: session.pid,
      });

      // Terminate the external process so the session is free for --resume
      try { process.kill(session.pid, 'SIGTERM'); } catch { /* already dead */ }

      const { cockpitId, workspacePath, claudeSessionId } = session;
      void (async () => {
        // Brief pause for the external process to exit and release session state
        await new Promise<void>((resolve) => setTimeout(resolve, 1200));
        resumeClaudeSession(cockpitId, workspacePath, undefined, claudeSessionId)
          .catch((err: unknown) => {
            logger.warn('claude-external', 'Auto-resume failed, will not retry this session', {
              cockpitId,
              error: String(err),
            });
          });
      })();
    }

    syncClaudeTranscriptUsage();
  } catch (err) {
    logger.warn('claude-external', 'Failed to import external Claude sessions', { error: String(err) });
  }
}

function syncClaudeTranscriptUsage(): void {
  const sessions = getAllSessions(db)
  for (const session of sessions) {
    if (session.provider !== 'claude' || session.finalStatus !== 'active') continue
    if (!session.workspacePath) continue

    const usage = readClaudeTranscriptUsage(session.sessionId, session.workspacePath)
    if (!usage) continue

    const previous = getLatestSessionUsageSnapshot(db, session.sessionId)
    if (areClaudeUsageSnapshotsEqual(previous, usage)) continue

    eventBus.emit('event', toClaudeTranscriptUsageEvent(session.sessionId, usage))
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
  } as import('@agentcockpit/shared').NormalizedEvent);
}

// Resume active managed Claude sessions that survived the daemon restart.
// Runs after orphaned session cleanup so only truly recent sessions are resumed.
const resumableSessions = getAllSessions(db).filter(
  (s) => s.finalStatus === 'active' && s.provider === 'claude' && s.capabilities.managedByDaemon,
);
if (resumableSessions.length > 0) {
  logger.info('daemon', `Resuming ${resumableSessions.length} managed Claude session(s)`, {
    sessionIds: resumableSessions.map((s) => s.sessionId),
  });
  for (const session of resumableSessions) {
    resumeClaudeSession(session.sessionId, session.workspacePath).catch((err: unknown) => {
      logger.warn('daemon', 'Failed to resume Claude session', {
        sessionId: session.sessionId,
        error: String(err),
      });
    });
  }
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
