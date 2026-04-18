import { createServer } from 'node:http';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../logger.js';
import type Database from 'better-sqlite3';
import type { NormalizedEvent } from '@cockpit/shared';
import { handleConnection } from './handlers.js';
import { CodexAdapter } from '../adapters/codex/codexAdapter.js';
import { ClaudeLauncher, LaunchError } from '../adapters/claude/claudeLauncher.js';
import { markSessionStarted } from '../adapters/claude/hookServer.js';
import { eventBus } from '../eventBus.js';
import { getEventsBySession, searchAll, getAllSessions, getSessionSummary, persistEvent, type SessionSummary } from '../db/queries.js';
import { resolveClaudeMdPath, resolveAutoMemoryPath, readFileSafe, writeFileSafe, getWorkspacePath } from '../memory/memoryReader.js';
import { insertNote, listNotes, deleteNote } from '../memory/memoryNotes.js';
import { getApprovalsBySession } from '../approvals/approvalStore.js';

// Pending agent-suggested memory writes: memoryKey → { workspace, value }
const pendingSuggestions = new Map<string, { workspace: string; value: string }>();

export interface ManagedSessionRuntime {
  provider: 'claude' | 'codex'
  sendMessage: (message: string) => Promise<string | void>
  terminateSession?: () => void
}

export interface ManagedSessionRegistry {
  register: (sessionId: string, runtime: ManagedSessionRuntime) => void
  unregister: (sessionId: string) => void
  get: (sessionId: string) => ManagedSessionRuntime | undefined
  has: (sessionId: string) => boolean
}

function createManagedSessionRegistry(): ManagedSessionRegistry {
  const runtimes = new Map<string, ManagedSessionRuntime>()
  return {
    register: (sessionId, runtime) => { runtimes.set(sessionId, runtime) },
    unregister: (sessionId) => { runtimes.delete(sessionId) },
    get: (sessionId) => runtimes.get(sessionId),
    has: (sessionId) => runtimes.has(sessionId),
  }
}

function applyRuntimeCapabilityState(
  summary: SessionSummary,
  runtimeRegistry: ManagedSessionRegistry,
): SessionSummary {
  const base = summary.capabilities
  if (summary.finalStatus !== 'active') {
    return {
      ...summary,
      capabilities: {
        ...base,
        canSendMessage: false,
        canTerminateSession: false,
        reason: 'Session is not active.',
      },
    }
  }
  if (!base.managedByDaemon) {
    return summary
  }
  if (runtimeRegistry.has(summary.sessionId)) {
    return {
      ...summary,
      capabilities: {
        ...base,
        canSendMessage: true,
        canTerminateSession: true,
      },
    }
  }
  return {
    ...summary,
    capabilities: {
      ...base,
      canSendMessage: false,
      canTerminateSession: false,
      reason: 'Managed session runtime is not available for chat send or terminate.',
    },
  }
}

const MAX_BODY = 1_048_576;

function handleLaunchSession(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  db: Database.Database,
  runtimeRegistry: ManagedSessionRegistry,
): void {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > MAX_BODY) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'payload too large' }));
      req.destroy();
    }
  });
  req.on('end', () => {
    void (async () => {
      try {
        const { provider, workspacePath } = JSON.parse(body) as { provider?: string; workspacePath?: string };
        if (!provider || !workspacePath) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'provider and workspacePath are required' }));
          return;
        }

        // Shared preflight: validate workspace exists
        if (!fs.existsSync(workspacePath)) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Workspace path does not exist: ${workspacePath}`, error_code: 'INVALID_WORKSPACE' }));
          return;
        }

        const sessionId = crypto.randomUUID();
        const hookPort = Number(process.env['COCKPIT_HOOK_PORT'] ?? '3002');

        if (provider === 'claude') {
          const launcher = new ClaudeLauncher(hookPort, db);
          await launcher.preflight(workspacePath);
          logger.info('launch', 'Launching claude session', { sessionId, workspacePath });
          const runtime = await launcher.launch(sessionId, workspacePath, () => {
            runtimeRegistry.unregister(sessionId);
            eventBus.emit('event', {
              schemaVersion: 1,
              sessionId,
              type: 'session_end',
              provider: 'claude',
              timestamp: new Date().toISOString(),
            } as NormalizedEvent);
          });
          runtimeRegistry.register(sessionId, {
            provider: 'claude',
            sendMessage: (message) => runtime.sendMessage(message),
            terminateSession: () => runtime.terminateSession(),
          });
          // Emit session_start immediately for daemon-launched Claude sessions so
          // the UI does not depend on a later hook that may never arrive while idle.
          markSessionStarted(sessionId);
          eventBus.emit('event', {
            schemaVersion: 1,
            sessionId,
            type: 'session_start',
            provider: 'claude',
            timestamp: new Date().toISOString(),
            workspacePath,
            managedByDaemon: true,
            canSendMessage: true,
            canTerminateSession: true,
          } as NormalizedEvent);
          logger.info('launch', 'Claude session spawned', { sessionId });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ sessionId, mode: 'initiated' }));
        } else {
          // Codex: spawn codex app-server as a child process
          const adapter = new CodexAdapter(
            sessionId,
            workspacePath,
            db,
            (event) => {
              if (event.type === 'session_end') {
                if (!runtimeRegistry.has(sessionId)) {
                  return;
                }
                runtimeRegistry.unregister(sessionId);
              }
              eventBus.emit('event', event);
            },
          );
          runtimeRegistry.register(sessionId, {
            provider: 'codex',
            sendMessage: (message) => adapter.sendChatMessage(message),
            terminateSession: () => {
              adapter.stop();
              runtimeRegistry.unregister(sessionId);
            },
          });
          logger.info('launch', 'Codex session spawned', { sessionId, workspacePath });
          adapter.start().catch((err: unknown) => {
            runtimeRegistry.unregister(sessionId);
            logger.error('launch', 'CodexAdapter.start() failed', { sessionId, error: String(err) });
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ sessionId, mode: 'initiated' }));
        }
      } catch (err: unknown) {
        if (err instanceof LaunchError) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message, error_code: err.code }));
          return;
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid JSON body' }));
      }
    })();
  });
}

export function createWsServer(
  db: Database.Database,
  port: number,
): { wss: WebSocketServer; httpServer: ReturnType<typeof createServer>; runtimeRegistry: ManagedSessionRegistry } {
  const httpServer = createServer();
  const wss = new WebSocketServer({ noServer: true });
  const runtimeRegistry = createManagedSessionRegistry();

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

    // GET /api/search?q=<query>
    const searchMatch = req.method === 'GET' && req.url?.startsWith('/api/search');
    if (searchMatch) {
      const url = new URL(req.url!, 'http://localhost');
      const q = url.searchParams.get('q') ?? '';
      const results = searchAll(db, q);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(results));
      return;
    }

    // GET /api/sessions/:id/summary (must come BEFORE /api/sessions list)
    const sessionSummaryMatch = req.method === 'GET' && req.url?.match(/^\/api\/sessions\/([^/]+)\/summary$/);
    if (sessionSummaryMatch) {
      const sessionId = sessionSummaryMatch[1]!;
      const summary = getSessionSummary(db, sessionId);
      if (!summary) {
        res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'session not found' }));
      } else {
        const withRuntime = applyRuntimeCapabilityState(summary, runtimeRegistry);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(withRuntime));
      }
      return;
    }

    // GET /api/sessions (all sessions list)
    const allSessionsMatch = req.method === 'GET' && req.url === '/api/sessions';
    if (allSessionsMatch) {
      const sessions = getAllSessions(db).map((summary) => applyRuntimeCapabilityState(summary, runtimeRegistry));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(sessions));
      return;
    }

    // GET /api/sessions/:id/approvals
    const approvalsMatch = req.method === 'GET' && req.url?.match(/^\/api\/sessions\/([^/]+)\/approvals$/);
    if (approvalsMatch) {
      const sessionId = approvalsMatch[1]!;
      const approvals = getApprovalsBySession(db, sessionId);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(approvals));
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
      handleLaunchSession(req, res, db, runtimeRegistry);
      return;
    }

    // GET /api/browse?path=<dir>  — returns immediate subdirectories for folder picker
    const browseMatch = req.method === 'GET' && req.url?.startsWith('/api/browse');
    if (browseMatch) {
      const url = new URL(req.url!, 'http://localhost');
      const rawPath = url.searchParams.get('path') ?? process.env['HOME'] ?? '/';
      const dirPath = rawPath.startsWith('~')
        ? rawPath.replace('~', process.env['HOME'] ?? '/')
        : rawPath;
      const resolved = path.resolve(dirPath);
      const allowedRoots = [process.env['HOME'] ?? '/', '/tmp'];
      if (!allowedRoots.some((r) => resolved.startsWith(r))) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'access denied' }));
        return;
      }
      try {
        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        const dirs = entries
          .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
          .map((e) => ({ name: e.name, fullPath: `${resolved.replace(/\/$/, '')}/${e.name}` }))
          .sort((a, b) => a.name.localeCompare(b.name));
        const parent = resolved !== '/' ? resolved.split('/').slice(0, -1).join('/') || '/' : null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ path: resolved, parent, entries: dirs }));
      } catch (err) {
        logger.error('browse', 'Cannot read directory', { dirPath: resolved, err });
        res.writeHead(422, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Cannot read directory' }));
      }
      return;
    }

    // POST /api/memory/suggestions/:id/approve
    const suggestApproveMatch = req.method === 'POST' && req.url?.match(/^\/api\/memory\/suggestions\/([^/]+)\/approve$/);
    if (suggestApproveMatch) {
      const suggestionId = decodeURIComponent(suggestApproveMatch[1]!);
      const pending = pendingSuggestions.get(suggestionId);
      if (!pending) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'suggestion not found' }));
        return;
      }
      const memoryPath = resolveAutoMemoryPath(pending.workspace);
      const existing = readFileSafe(memoryPath) ?? '';
      const updated = existing.trimEnd() + '\n\n' + pending.value;
      writeFileSafe(memoryPath, updated);
      pendingSuggestions.delete(suggestionId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // DELETE /api/memory/suggestions/:id
    const suggestRejectMatch = req.method === 'DELETE' && req.url?.match(/^\/api\/memory\/suggestions\/([^/]+)$/);
    if (suggestRejectMatch) {
      const suggestionId = decodeURIComponent(suggestRejectMatch[1]!);
      pendingSuggestions.delete(suggestionId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // DELETE /api/memory/notes/:noteId  (more specific — before GET notes)
    const noteDeleteMatch = req.method === 'DELETE' && req.url?.match(/^\/api\/memory\/notes\/([^/]+)$/);
    if (noteDeleteMatch) {
      const noteId = noteDeleteMatch[1]!;
      deleteNote(db, noteId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // GET /api/memory/notes?workspace=<path>
    const notesGetMatch = req.method === 'GET' && req.url?.startsWith('/api/memory/notes');
    if (notesGetMatch) {
      const url = new URL(req.url!, 'http://localhost');
      const workspace = url.searchParams.get('workspace') ?? '';
      const notes = listNotes(db, workspace);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(notes));
      return;
    }

    // POST /api/memory/notes
    if (req.method === 'POST' && req.url === '/api/memory/notes') {
      let body = '';
      req.on('data', (c) => {
        body += c;
        if (body.length > MAX_BODY) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'payload too large' }));
          req.destroy();
        }
      });
      req.on('end', () => {
        try {
          const { workspace, content, pinned } = JSON.parse(body) as { workspace: string; content: string; pinned?: boolean };
          if (!workspace || !content) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'workspace and content required' })); return; }
          const note = insertNote(db, { workspace, content, pinned });
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(note));
        } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid body' })); }
      });
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
    const url = new URL(req.url ?? '/', 'http://localhost');
    const lastSeenSequence = url.searchParams.get('lastSeenSequence') ?? '0';
    logger.info('ws', 'Client connected', {
      remoteAddress: req.socket.remoteAddress,
      lastSeenSequence,
      totalClients: wss.clients.size + 1,
    });
    ws.on('close', (code, reason) => {
      logger.info('ws', 'Client disconnected', {
        code,
        reason: reason.toString(),
        remainingClients: wss.clients.size,
      });
    });
    handleConnection(ws, req, db, {
      runtimeRegistry: {
        get: (sessionId) => runtimeRegistry.get(sessionId),
        unregister: (sessionId) => runtimeRegistry.unregister(sessionId),
      },
      emitEvent: (event: NormalizedEvent) => {
        const saved = persistEvent(db, event);
        broadcast(wss, JSON.stringify(saved), db);
      },
    });
  });

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error('ws', `Port ${port} is already in use`, { port });
      process.exit(1);
    }
    throw err;
  });

  httpServer.listen(port, () => {
    logger.info('ws', `WebSocket server listening`, { url: `ws://localhost:${port}` });
  });

  return { wss, httpServer, runtimeRegistry };
}

export function broadcast(wss: WebSocketServer, payload: string, db?: Database.Database): void {
  // Populate pendingSuggestions when a memory_write event with suggested=true is broadcast
  let parsedForLog: { type?: string; sessionId?: string; sequenceNumber?: number } | null = null;
  if (db) {
    try {
      const parsed = JSON.parse(payload) as { type?: string; suggested?: boolean; sessionId?: string; memoryKey?: string; value?: unknown; sequenceNumber?: number };
      parsedForLog = { type: parsed.type, sessionId: parsed.sessionId, sequenceNumber: parsed.sequenceNumber };
      if (parsed.type === 'memory_write' && parsed.suggested === true) {
        const workspace = getWorkspacePath(db, parsed.sessionId ?? '');
        if (workspace && parsed.memoryKey) {
          pendingSuggestions.set(parsed.memoryKey, { workspace, value: String(parsed.value ?? '') });
        }
      }
    } catch { /* ignore parse errors */ }
  }

  let sent = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      sent++;
    }
  });

  if (parsedForLog?.type) {
    logger.debug('broadcast', `Event broadcast: ${parsedForLog.type}`, {
      sessionId: parsedForLog.sessionId,
      seq: parsedForLog.sequenceNumber,
      clients: sent,
    });
  }
}
