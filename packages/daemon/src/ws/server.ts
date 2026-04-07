import { createServer } from 'node:http';
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type Database from 'better-sqlite3';
import { handleConnection } from './handlers.js';
import { CodexAdapter } from '../adapters/codex/codexAdapter.js';
import { eventBus } from '../eventBus.js';
import { getEventsBySession } from '../db/queries.js';
import { resolveClaudeMdPath, resolveAutoMemoryPath, readFileSafe, writeFileSafe, getWorkspacePath } from '../memory/memoryReader.js';
import { insertNote, listNotes, deleteNote } from '../memory/memoryNotes.js';

function handleLaunchSession(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  db: Database.Database,
): void {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    try {
      const { provider, workspacePath } = JSON.parse(body) as { provider?: string; workspacePath?: string };
      if (!provider || !workspacePath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'provider and workspacePath are required' }));
        return;
      }
      const sessionId = crypto.randomUUID();
      if (provider === 'claude') {
        // SESS-02 configure-and-copy: Claude cannot be safely spawned as Node child process
        // (see RESEARCH.md open question 1 / GitHub issue #771)
        // Return the hook configuration command for the user to run manually
        const hookPort = process.env['COCKPIT_HOOK_PORT'] ?? '3002';
        const hookCommand = `COCKPIT_SESSION_ID=${sessionId} claude --hooks http://localhost:${hookPort}/hook`;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sessionId, hookCommand, mode: 'configure-and-copy' }));
      } else {
        // Codex: spawn codex app-server as a child process
        const adapter = new CodexAdapter(
          sessionId,
          workspacePath,
          db,
          (event) => eventBus.emit('event', event),
        );
        adapter.start().catch((err: unknown) => {
          console.error('[cockpit-daemon] CodexAdapter.start() failed:', err);
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sessionId, mode: 'spawn' }));
      }
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid JSON body' }));
    }
  });
}

export function createWsServer(
  db: Database.Database,
  port: number,
): { wss: WebSocketServer; httpServer: ReturnType<typeof createServer> } {
  const httpServer = createServer();
  const wss = new WebSocketServer({ noServer: true });

  // Handle standard HTTP requests (REST API)
  httpServer.on('request', (req, res) => {
    // CORS for localhost dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // GET /api/memory/:sessionId/claude-md
    const claudeMdGetMatch = req.method === 'GET' && req.url?.match(/^\/api\/memory\/([^/]+)\/claude-md$/);
    if (claudeMdGetMatch) {
      const sessionId = claudeMdGetMatch[1]!;
      const workspace = getWorkspacePath(db, sessionId);
      if (!workspace) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'session not found' })); return; }
      const filePath = resolveClaudeMdPath(workspace);
      const content = readFileSafe(filePath);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content, path: content !== null ? filePath : null }));
      return;
    }

    // PUT /api/memory/:sessionId/claude-md
    const claudeMdPutMatch = req.method === 'PUT' && req.url?.match(/^\/api\/memory\/([^/]+)\/claude-md$/);
    if (claudeMdPutMatch) {
      const sessionId = claudeMdPutMatch[1]!;
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const workspace = getWorkspacePath(db, sessionId);
          if (!workspace) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'session not found' })); return; }
          const { content } = JSON.parse(body) as { content: string };
          writeFileSafe(resolveClaudeMdPath(workspace), content);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid body' })); }
      });
      return;
    }

    // GET /api/memory/:sessionId/auto-memory
    const autoMemoryMatch = req.method === 'GET' && req.url?.match(/^\/api\/memory\/([^/]+)\/auto-memory$/);
    if (autoMemoryMatch) {
      const sessionId = autoMemoryMatch[1]!;
      const workspace = getWorkspacePath(db, sessionId);
      if (!workspace) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'session not found' })); return; }
      const content = readFileSafe(resolveAutoMemoryPath(workspace));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content }));
      return;
    }

    const eventsMatch = req.method === 'GET' && req.url?.match(/^\/api\/sessions\/([^/]+)\/events$/);
    if (eventsMatch) {
      const sessionId = eventsMatch[1]!;
      const events = getEventsBySession(db, sessionId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(events));
      return;
    }

    if (req.method === 'POST' && req.url === '/api/sessions') {
      handleLaunchSession(req, res, db);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  httpServer.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws, req) => {
    handleConnection(ws, req, db);
  });

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[cockpit-daemon] Port ${port} is already in use. Stop the existing daemon or set COCKPIT_WS_PORT to a different port.`);
      process.exit(1);
    }
    throw err;
  });

  httpServer.listen(port, () => {
    console.log(`[cockpit-daemon] WebSocket server listening on ws://localhost:${port}`);
  });

  return { wss, httpServer };
}

export function broadcast(wss: WebSocketServer, payload: string): void {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}
