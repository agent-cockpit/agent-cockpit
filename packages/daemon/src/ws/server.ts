import type { NormalizedEvent } from '@agentcockpit/shared';
import type Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http, { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { LaunchError } from '../adapters/claude/claudeLauncher.js';
import { PtyLauncher, type PtyRuntime } from '../adapters/claude/ptyLauncher.js';
import { markSessionStarted } from '../adapters/claude/hookServer.js';
import { CodexAdapter } from '../adapters/codex/codexAdapter.js';
import { getApprovalsBySession } from '../approvals/approvalStore.js';
import { approvalQueue } from '../approvals/approvalQueue.js';
import { deleteSessionRecords, getAllSessions, getEventsBySession, getSessionStats, getSessionSummary, getUsageStats, persistEvent, searchAll, type SessionSummary } from '../db/queries.js';
import { eventBus } from '../eventBus.js';
import { logger } from '../logger.js';
import { deleteNote, insertNote, listNotes } from '../memory/memoryNotes.js';
import { getWorkspacePath, readFileSafe, resolveAutoMemoryPath, resolveClaudeMdPath, writeFileSafe } from '../memory/memoryReader.js';
import { handleConnection } from './handlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '..', '..', 'public');

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
const HOME_DIR = os.homedir();

function expandBrowsePath(rawPath: string): string {
  return rawPath.replace(/^~(?=$|[\\/])/, HOME_DIR);
}

function isWithinRoot(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// Per-session cumulative token counts parsed from PTY terminal output
const ptyTokenAccumulator = new Map<string, { input: number; output: number }>()
// Rolling buffer per session so patterns split across PTY chunks are still matched
const ptyDataBuffers = new Map<string, string>()
const PTY_BUFFER_MAX = 16384

function stripAnsi(raw: string): string {
  return raw
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')           // CSI sequences (colors, cursor movement)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // OSC sequences (window title, hyperlinks)
    .replace(/\x1b[@-_][^\x80-\xff]?/g, '')            // 2-char ESC sequences
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // other non-printable control chars
}

// Try to extract (input, output) token counts from a clean (no-ANSI) text block.
// Covers every known Claude Code terminal output format.
function extractTokenCounts(text: string): { input: number; output: number } | null {
  const t = text.replace(/\r/g, '\n')

  function parse(s: string): number { return parseInt(s.replace(/,/g, ''), 10) }
  function ok(n: number): boolean { return Number.isFinite(n) && n >= 0 }

  // ── Format 1: "Input tokens: 1,234" + "Output tokens: 567" ─────────────────
  // Covers: "Input tokens: X", "input token: X", "Input Tokens: X"
  {
    const i = t.match(/[Ii]nput\s+[Tt]okens?[:\s]+([\d,]+)/)
    const o = t.match(/[Oo]utput\s+[Tt]okens?[:\s]+([\d,]+)/)
    if (i && o) {
      const input = parse(i[1]!), output = parse(o[1]!)
      if (ok(input) && ok(output)) return { input, output }
    }
  }

  // ── Format 2: "X↑ Y↓" — arrow AFTER number (most common in Claude Code UI) ─
  {
    const m = t.match(/([\d,]+)\s*↑[^\S\n]*([\d,]+)\s*↓/)
    if (m) {
      const input = parse(m[1]!), output = parse(m[2]!)
      if (ok(input) && ok(output)) return { input, output }
    }
  }

  // ── Format 3: "↑X ↓Y" — arrow BEFORE number ────────────────────────────────
  {
    const m = t.match(/↑\s*([\d,]+)[^\S\n↓]*↓\s*([\d,]+)/)
    if (m) {
      const input = parse(m[1]!), output = parse(m[2]!)
      if (ok(input) && ok(output)) return { input, output }
    }
  }

  // ── Format 4: "1,234 in, 567 out" or "1,234 in / 567 out" ──────────────────
  {
    const m = t.match(/([\d,]+)\s+in\b[^a-z\n]*?([\d,]+)\s+out\b/)
    if (m) {
      const input = parse(m[1]!), output = parse(m[2]!)
      // Sanity: at least one of them must be > 0
      if (ok(input) && ok(output) && (input > 0 || output > 0)) return { input, output }
    }
  }

  // ── Format 5: "Input: 1,234" + "Output: 567" (short labels) ────────────────
  {
    const i = t.match(/\bInput:\s*([\d,]+)/)
    const o = t.match(/\bOutput:\s*([\d,]+)/)
    if (i && o) {
      const input = parse(i[1]!), output = parse(o[1]!)
      // Require input > 50 to avoid matching unrelated "Input: 5" style lines
      if (ok(input) && ok(output) && input > 50) return { input, output }
    }
  }

  // ── Format 6: "(1,234 input, 567 output)" — inside parentheses ──────────────
  {
    const m = t.match(/\(\s*([\d,]+)\s+input[^,)]*,?\s*([\d,]+)\s+output/)
    if (m) {
      const input = parse(m[1]!), output = parse(m[2]!)
      if (ok(input) && ok(output)) return { input, output }
    }
  }

  return null
}

function parsePtyTokens(sessionId: string, newData: string): { input: number; output: number } | null {
  let buf = (ptyDataBuffers.get(sessionId) ?? '') + newData
  if (buf.length > PTY_BUFFER_MAX) buf = buf.slice(-PTY_BUFFER_MAX)
  ptyDataBuffers.set(sessionId, buf)

  const clean = stripAnsi(buf)
  const result = extractTokenCounts(clean)
  if (result) {
    logger.info('pty-tokens', 'Token match from PTY output', { sessionId, ...result })
    ptyDataBuffers.set(sessionId, '')
    return result
  }
  return null
}

function handleLaunchSession(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  db: Database.Database,
  runtimeRegistry: ManagedSessionRegistry,
  extras: { broadcastRaw: (payload: string) => void; ptyRegistry: Map<string, PtyRuntime>; hookPort: number },
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
        const {
          provider,
          workspacePath,
          skipPermissions,
          permissionMode: requestedPermissionMode,
          model,
          cols,
          rows,
        } = JSON.parse(body) as {
          provider?: string;
          workspacePath?: string;
          skipPermissions?: boolean;
          permissionMode?: string;
          model?: string;
          cols?: number;
          rows?: number;
        };
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
        const { broadcastRaw, ptyRegistry, hookPort } = extras;

        if (provider === 'claude') {
          const ptyLaunch = new PtyLauncher(hookPort, db);
          logger.info('launch', 'Launching claude PTY session', { sessionId, workspacePath, model });
          const ptyRuntime = await ptyLaunch.launch(
            sessionId,
            workspacePath,
            (data) => {
              broadcastRaw(JSON.stringify({ type: 'pty_output', sessionId, data }));
              const parsed = parsePtyTokens(sessionId, data);
              if (parsed) {
                const prev = ptyTokenAccumulator.get(sessionId) ?? { input: 0, output: 0 };
                const acc = { input: prev.input + parsed.input, output: prev.output + parsed.output };
                ptyTokenAccumulator.set(sessionId, acc);
                eventBus.emit('event', {
                  schemaVersion: 1,
                  sessionId,
                  type: 'session_usage',
                  provider: 'claude',
                  timestamp: new Date().toISOString(),
                  inputTokens: acc.input,
                  outputTokens: acc.output,
                  totalTokens: acc.input + acc.output,
                } as NormalizedEvent);
              }
            },
            () => {
              ptyRegistry.delete(sessionId);
              runtimeRegistry.unregister(sessionId);
              ptyTokenAccumulator.delete(sessionId);
              ptyDataBuffers.delete(sessionId);
              eventBus.emit('event', {
                schemaVersion: 1,
                sessionId,
                type: 'session_end',
                provider: 'claude',
                timestamp: new Date().toISOString(),
              } as NormalizedEvent);
            },
            model,
            typeof cols === 'number' && cols > 0 ? cols : undefined,
            typeof rows === 'number' && rows > 0 ? rows : undefined,
          );
          ptyRegistry.set(sessionId, ptyRuntime);
          runtimeRegistry.register(sessionId, {
            provider: 'claude',
            sendMessage: (msg) => { ptyRuntime.write(msg + '\n'); return Promise.resolve(); },
            terminateSession: () => ptyRuntime.kill(),
          });
          markSessionStarted(sessionId);
          eventBus.emit('event', {
            schemaVersion: 1,
            sessionId,
            type: 'session_start',
            provider: 'claude',
            timestamp: new Date().toISOString(),
            workspacePath,
            managedByDaemon: true,
            canSendMessage: false,
            canTerminateSession: true,
            mode: 'pty',
          } as NormalizedEvent);
          logger.info('launch', 'Claude PTY session spawned', { sessionId });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ sessionId, mode: 'pty' }));
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
        logger.error('launch', 'Session launch failed', { error: String(err) });
        if (err instanceof LaunchError) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message, error_code: err.code }));
          return;
        }
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
    })();
  });
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
};

function serveStaticFile(res: http.ServerResponse, filePath: string): void {
  const content = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
  res.end(content);
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (req.method !== 'GET') {
    res.writeHead(404);
    res.end();
    return;
  }
  const urlPath = new URL(req.url ?? '/', 'http://localhost').pathname;
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    serveStaticFile(res, filePath);
    return;
  }
  if (fs.existsSync(path.join(filePath, 'index.html'))) {
    serveStaticFile(res, path.join(filePath, 'index.html'));
    return;
  }
  const indexHtml = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexHtml)) {
    serveStaticFile(res, indexHtml);
    return;
  }
  res.writeHead(404);
  res.end();
}

export function createWsServer(
  db: Database.Database,
  port: number,
  hookPort: number,
): { wss: WebSocketServer; httpServer: ReturnType<typeof createServer>; runtimeRegistry: ManagedSessionRegistry } {
  const httpServer = createServer();
  const wss = new WebSocketServer({ noServer: true });
  const runtimeRegistry = createManagedSessionRegistry();
  const ptyRegistry = new Map<string, PtyRuntime>();

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

    // GET /api/sessions/:id/stats
    const sessionStatsMatch = req.method === 'GET' && req.url?.match(/^\/api\/sessions\/([^/]+)\/stats$/);
    if (sessionStatsMatch) {
      const sessionId = sessionStatsMatch[1]!;
      const stats = getSessionStats(db, sessionId);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(stats));
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

    // GET /api/stats
    if (req.method === 'GET' && req.url === '/api/stats') {
      const stats = getUsageStats(db)
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      res.end(JSON.stringify(stats))
      return
    }

    // GET /api/sessions (all sessions list)
    const allSessionsMatch = req.method === 'GET' && req.url === '/api/sessions';
    if (allSessionsMatch) {
      const sessions = getAllSessions(db).map((summary) => applyRuntimeCapabilityState(summary, runtimeRegistry));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(sessions));
      return;
    }

    // DELETE /api/sessions (bulk)
    if (req.method === 'DELETE' && req.url === '/api/sessions') {
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
            const parsed = body
              ? JSON.parse(body) as { sessionIds?: unknown; terminateActive?: unknown; deleteAll?: unknown }
              : {};

            const terminateActive = parsed.terminateActive === true;
            const deleteAll = parsed.deleteAll === true;
            const sessionIds = Array.isArray(parsed.sessionIds)
              ? parsed.sessionIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
              : [];

            if (!deleteAll && sessionIds.length === 0) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'sessionIds is required when deleteAll is false' }));
              return;
            }

            const summaries = getAllSessions(db);
            const byId = new Map(summaries.map((summary) => [summary.sessionId, summary]));
            const targetIds = deleteAll
              ? summaries.map((summary) => summary.sessionId)
              : Array.from(new Set(sessionIds));

            const deletedSessionIds: string[] = [];
            const terminatedSessionIds: string[] = [];
            const skipped: Array<{ sessionId: string; reason: string }> = [];

            for (const sessionId of targetIds) {
              const summary = byId.get(sessionId);
              if (!summary) {
                skipped.push({ sessionId, reason: 'Session was not found.' });
                continue;
              }

              if (summary.finalStatus === 'active') {
                if (!terminateActive) {
                  skipped.push({ sessionId, reason: 'Session is active. Confirm termination before deleting.' });
                  continue;
                }

                const runtimeAwareSummary = applyRuntimeCapabilityState(summary, runtimeRegistry);
                if (runtimeAwareSummary.capabilities.canTerminateSession !== true) {
                  skipped.push({
                    sessionId,
                    reason: runtimeAwareSummary.capabilities.reason ?? 'Active session cannot be terminated by daemon.',
                  });
                  continue;
                }

                const runtime = runtimeRegistry.get(sessionId);
                if (!runtime?.terminateSession) {
                  skipped.push({ sessionId, reason: 'Managed session runtime is not available for terminate.' });
                  continue;
                }

                try {
                  await Promise.resolve(runtime.terminateSession());
                  runtimeRegistry.unregister(sessionId);
                  terminatedSessionIds.push(sessionId);
                } catch (err) {
                  skipped.push({ sessionId, reason: `Failed to terminate session: ${String(err)}` });
                  continue;
                }
              }

              deleteSessionRecords(db, sessionId);
              deletedSessionIds.push(sessionId);
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ deletedSessionIds, terminatedSessionIds, skipped }));
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid JSON body' }));
          }
        })();
      });
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
      handleLaunchSession(req, res, db, runtimeRegistry, {
        broadcastRaw: (payload) => broadcast(wss, payload),
        ptyRegistry,
        hookPort,
      });
      return;
    }

    // GET /api/browse?path=<dir>  — returns immediate subdirectories for folder picker
    const browseMatch = req.method === 'GET' && req.url?.startsWith('/api/browse');
    if (browseMatch) {
      const url = new URL(req.url!, 'http://localhost');
      const rawPath = url.searchParams.get('path') ?? HOME_DIR;
      const resolved = path.resolve(expandBrowsePath(rawPath));
      const allowedRoots = [path.resolve(HOME_DIR), path.resolve(os.tmpdir())];
      if (!allowedRoots.some((root) => isWithinRoot(resolved, root))) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'access denied' }));
        return;
      }
      try {
        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        const dirs = entries
          .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
          .map((e) => ({ name: e.name, fullPath: path.join(resolved, e.name) }))
          .sort((a, b) => a.name.localeCompare(b.name));
        const parentPath = path.dirname(resolved);
        const parent = parentPath === resolved ? null : parentPath;
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

    serveStatic(req, res);
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
      ptyRegistry: {
        get: (sessionId) => ptyRegistry.get(sessionId),
      },
      autoApproveForSession: (sessionId) => {
        const pendingIds = approvalQueue.getPendingForSession(sessionId);
        if (pendingIds.length > 0) {
          approvalQueue.decide(pendingIds[0]!, 'approve', db);
        }
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
