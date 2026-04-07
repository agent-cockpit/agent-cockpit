import { openDatabase } from './db/database.js';
import { persistEvent } from './db/queries.js';
import { createWsServer, broadcast } from './ws/server.js';
import { createHookServer } from './adapters/claude/hookServer.js';
import { approvalQueue } from './approvals/approvalQueue.js';
import { eventBus } from './eventBus.js';
import type { WebSocketServer } from 'ws';
import type Database from 'better-sqlite3';
import type http from 'node:http';

const DB_PATH = process.env['COCKPIT_DB_PATH'] ?? `${process.env['HOME']}/.local/share/agent-cockpit/events.db`;
const WS_PORT = parseInt(process.env['COCKPIT_WS_PORT'] ?? '3001', 10);
const HOOK_PORT = parseInt(process.env['COCKPIT_HOOK_PORT'] ?? '3002', 10);

const db = openDatabase(DB_PATH);

// Hook server — started after DB, before WS
const hookServer = createHookServer(
  HOOK_PORT,
  (event) => eventBus.emit('event', event),
  (approvalId, event) => approvalQueue.register(approvalId, event, db),
);

hookServer.once('listening', () => {
  console.log('[cockpit-daemon] Hook server listening on port', HOOK_PORT);
});

const { wss, httpServer } = createWsServer(db, WS_PORT);

// Event pipeline: eventBus → persist → broadcast
eventBus.on('event', (rawEvent) => {
  const saved = persistEvent(db, rawEvent);
  broadcast(wss, JSON.stringify(saved), db);
});

// Graceful shutdown
function shutdown(db: Database.Database, wss: WebSocketServer, hookServer: http.Server): void {
  console.log('[cockpit-daemon] Shutting down...');
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
  console.log(`[cockpit-daemon] Started. DB: ${DB_PATH}, WS port: ${WS_PORT}`);
});
