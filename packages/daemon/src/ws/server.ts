import type { NormalizedEvent } from '@agentcockpit/shared';
import type Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http, { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { ClaudeLauncher, type ClaudePermissionMode, LaunchError } from '../adapters/claude/claudeLauncher.js';
import { markSessionStarted } from '../adapters/claude/hookServer.js';
import { CodexAdapter } from '../adapters/codex/codexAdapter.js';
import { getApprovalsBySession } from '../approvals/approvalStore.js';
import { deleteSessionRecords, getAllSessions, getClaudeSessionRecord, getCodexSessionRecord, getEventsBySession, getResumeContext, getSessionStats, getSessionSummary, getUsageStats, persistEvent, searchAll, upsertResumeContext, upsertSessionLabels, type SessionSummary } from '../db/queries.js';
import { eventBus } from '../eventBus.js';
import { logger } from '../logger.js';
import { deleteNote, insertNote, listNotes } from '../memory/memoryNotes.js';
import { getWorkspacePath, readFileSafe, resolveAgentsMdPath, resolveAutoMemoryPath, resolveClaudeMdPath, writeFileSafe } from '../memory/memoryReader.js';
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

function detectGitBranch(workspacePath: string): string | undefined {
  try {
    const out = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: workspacePath,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500,
    }).toString().trim();
    if (!out || out === 'HEAD') return undefined;
    return out.slice(0, 120);
  } catch {
    return undefined;
  }
}

function deriveProjectId(workspacePath: string): string {
  const normalized = path.resolve(workspacePath)
  const basename = path.basename(normalized).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project'
  const hash = crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 8)
  return `${basename}-${hash}`.slice(0, 80)
}

function normalizePromptForResume(value: string | undefined): string | null {
  const normalized = typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').slice(0, 500)
    : ''
  return normalized || null
}

function isWithinRoot(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

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
        const {
          provider,
          workspacePath,
          skipPermissions,
          permissionMode: requestedPermissionMode,
          taskTitle: requestedTaskTitle,
        } = JSON.parse(body) as {
          provider?: string;
          workspacePath?: string;
          skipPermissions?: boolean;
          permissionMode?: string;
          taskTitle?: string;
        };
        if (!provider || !workspacePath) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'provider and workspacePath are required' }));
          return;
        }
        const taskTitle = typeof requestedTaskTitle === 'string'
          ? requestedTaskTitle.trim().replace(/\s+/g, ' ').slice(0, 120)
          : '';
        const resumePrompt = normalizePromptForResume(requestedTaskTitle);
        const branch = detectGitBranch(workspacePath);
        const projectId = deriveProjectId(workspacePath);

        // Shared preflight: validate workspace exists
        if (!fs.existsSync(workspacePath)) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Workspace path does not exist: ${workspacePath}`, error_code: 'INVALID_WORKSPACE' }));
          return;
        }

        const sessionId = crypto.randomUUID();
        const hookPort = Number(process.env['COCKPIT_HOOK_PORT'] ?? '3002');

        if (provider === 'claude') {
          if (
            requestedPermissionMode !== undefined &&
            requestedPermissionMode !== 'default' &&
            requestedPermissionMode !== 'dangerously_skip'
          ) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: "permissionMode must be 'default' or 'dangerously_skip'",
            }));
            return;
          }

          const permissionMode: ClaudePermissionMode =
            (requestedPermissionMode as ClaudePermissionMode | undefined)
            ?? (skipPermissions === true ? 'dangerously_skip' : 'default');

          const launcher = new ClaudeLauncher(hookPort, db);
          await launcher.preflight(workspacePath);
          upsertResumeContext(db, {
            sessionId,
            provider: 'claude',
            workspace: workspacePath,
            branch: branch ?? null,
            lastPrompt: resumePrompt,
            providerThreadId: sessionId,
            resumeSource: 'launch',
          });
          logger.info('launch', 'Launching claude session', {
            sessionId,
            workspacePath,
            permissionMode,
            // Backward compatibility with older UI payloads.
            skipPermissions: skipPermissions ?? false,
          });
          const runtime = await launcher.launch(sessionId, workspacePath, (info) => {
            runtimeRegistry.unregister(sessionId);
            eventBus.emit('event', {
              schemaVersion: 1,
              sessionId,
              type: 'session_end',
              provider: 'claude',
              timestamp: new Date().toISOString(),
              ...(info?.exitCode !== undefined && info.exitCode !== null ? { exitCode: info.exitCode } : {}),
              ...(info?.failureReason ? { failureReason: info.failureReason } : {}),
            } as NormalizedEvent);
          }, (assistantText) => {
            const content = assistantText;
            if (!content) return;
            logger.info('launch', 'Claude assistant output captured', { sessionId, chars: content.length });
            eventBus.emit('event', {
              schemaVersion: 1,
              sessionId,
              type: 'session_chat_message',
              provider: 'claude',
              role: 'assistant',
              content,
              timestamp: new Date().toISOString(),
            } as NormalizedEvent);
          }, permissionMode, (usageSnapshot) => {
            eventBus.emit('event', {
              schemaVersion: 1,
              sessionId,
              type: 'session_usage',
              provider: 'claude',
              timestamp: new Date().toISOString(),
              inputTokens: usageSnapshot.inputTokens,
              outputTokens: usageSnapshot.outputTokens,
              totalTokens: usageSnapshot.totalTokens,
              cachedInputTokens: usageSnapshot.cachedInputTokens,
              ...(usageSnapshot.contextUsedTokens !== undefined
                ? { contextUsedTokens: usageSnapshot.contextUsedTokens }
                : {}),
              ...(usageSnapshot.contextWindowTokens !== undefined
                ? { contextWindowTokens: usageSnapshot.contextWindowTokens }
                : {}),
              ...(usageSnapshot.contextPercent !== undefined
                ? { contextPercent: usageSnapshot.contextPercent }
                : {}),
              ...(usageSnapshot.model ? { model: usageSnapshot.model } : {}),
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
            projectId,
            ...(branch ? { branch } : {}),
            ...(taskTitle ? { taskTitle } : {}),
          } as NormalizedEvent);
          if (taskTitle || branch || projectId) {
            eventBus.emit('event', {
              schemaVersion: 1,
              sessionId,
              type: 'task_created',
              timestamp: new Date().toISOString(),
              workspacePath,
              projectId,
              ...(taskTitle ? { taskTitle } : {}),
              ...(branch ? { branch } : {}),
            } as NormalizedEvent);
          }
          logger.info('launch', 'Claude session spawned', { sessionId });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ sessionId, mode: 'initiated' }));
        } else {
          upsertResumeContext(db, {
            sessionId,
            provider: 'codex',
            workspace: workspacePath,
            branch: branch ?? null,
            lastPrompt: resumePrompt,
            resumeSource: 'launch',
          });
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
            undefined,
            undefined,
            { branch, taskTitle: taskTitle || undefined, projectId },
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

    // GET /api/memory/:sessionId/agents-md  — Codex AGENTS.md mirror of CLAUDE.md
    const agentsMdMatch = req.method === 'GET' && req.url?.match(/^\/api\/memory\/([^/]+)\/agents-md$/);
    if (agentsMdMatch) {
      const sessionId = agentsMdMatch[1]!;
      const workspace = getWorkspacePath(db, sessionId);
      if (!workspace) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'session not found' })); return; }
      const filePath = resolveAgentsMdPath(workspace);
      const content = readFileSafe(filePath);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content, path: content !== null ? filePath : null }));
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

    // PUT /api/sessions/:id/labels
    const sessionLabelsMatch = req.method === 'PUT' && req.url?.match(/^\/api\/sessions\/([^/]+)\/labels$/);
    if (sessionLabelsMatch) {
      const sessionId = decodeURIComponent(sessionLabelsMatch[1]!);
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
        try {
          if (!getSessionSummary(db, sessionId)) {
            res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'session not found' }));
            return;
          }
          const parsed = body ? JSON.parse(body) as { title?: unknown; tags?: unknown } : {};
          const labels = upsertSessionLabels(db, sessionId, {
            title: typeof parsed.title === 'string' ? parsed.title : '',
            tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag): tag is string => typeof tag === 'string') : [],
          });
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify(labels));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: 'invalid JSON body' }));
        }
      });
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
      handleLaunchSession(req, res, db, runtimeRegistry);
      return;
    }

    // POST /api/sessions/:id/resume — resume daemon-managed Codex/Claude sessions
    const resumeMatch = req.method === 'POST' && req.url?.match(/^\/api\/sessions\/([^/]+)\/resume$/);
    if (resumeMatch) {
      const sessionId = decodeURIComponent(resumeMatch[1]!);
      void (async () => {
        try {
          if (runtimeRegistry.has(sessionId)) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Session is already active.' }));
            return;
          }

          const resumeContext = getResumeContext(db, sessionId);
          const codexRow = getCodexSessionRecord(db, sessionId);
          const possibleClaudeRow = codexRow ? null : getClaudeSessionRecord(db, sessionId);
          const claudeRow = possibleClaudeRow?.claudeId === sessionId ? possibleClaudeRow : null;

          if (!codexRow && !claudeRow) {
            res.writeHead(422, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'Resume is only supported for daemon-managed Claude or Codex sessions with saved provider context. External sessions can still be inspected, but cannot be resumed from Agent Cockpit.',
            }));
            return;
          }

          if (codexRow) {
            const context = upsertResumeContext(db, {
              sessionId,
              provider: 'codex',
              workspace: codexRow.workspace,
              branch: resumeContext?.branch ?? detectGitBranch(codexRow.workspace) ?? null,
              lastPrompt: resumeContext?.lastPrompt ?? null,
              providerThreadId: codexRow.threadId,
              resumeSource: 'codex_thread',
            });

          const adapter = new CodexAdapter(
            sessionId,
            codexRow.workspace,
            db,
            (event) => {
              if (event.type === 'session_end') {
                if (!runtimeRegistry.has(sessionId)) return;
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

          adapter.start().catch((err: unknown) => {
            runtimeRegistry.unregister(sessionId);
            logger.error('resume', 'CodexAdapter.start() failed', { sessionId, error: String(err) });
          });

          eventBus.emit('event', {
            schemaVersion: 1,
            sessionId,
            type: 'session_resumed',
            provider: 'codex',
            timestamp: new Date().toISOString(),
            resumedFromSessionId: sessionId,
            resumeSource: 'codex_thread',
            workspacePath: codexRow.workspace,
            ...(context.branch ? { branch: context.branch } : {}),
            ...(context.lastPrompt ? { lastPrompt: context.lastPrompt } : {}),
            providerThreadId: codexRow.threadId,
          } as NormalizedEvent);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ sessionId, mode: 'resumed', provider: 'codex', resumeSource: 'codex_thread' }));
          return;
          }

          const claudeContext = upsertResumeContext(db, {
            sessionId,
            provider: 'claude',
            workspace: claudeRow!.workspace,
            branch: resumeContext?.branch ?? detectGitBranch(claudeRow!.workspace) ?? null,
            lastPrompt: resumeContext?.lastPrompt ?? null,
            providerThreadId: claudeRow!.claudeId,
            resumeSource: 'claude_continue',
          });
          const hookPort = Number(process.env['COCKPIT_HOOK_PORT'] ?? '3002');
          const launcher = new ClaudeLauncher(hookPort, db);
          await launcher.preflight(claudeRow!.workspace);
          const runtime = await launcher.launch(sessionId, claudeRow!.workspace, (info) => {
            runtimeRegistry.unregister(sessionId);
            eventBus.emit('event', {
              schemaVersion: 1,
              sessionId,
              type: 'session_end',
              provider: 'claude',
              timestamp: new Date().toISOString(),
              ...(info?.exitCode !== undefined && info.exitCode !== null ? { exitCode: info.exitCode } : {}),
              ...(info?.failureReason ? { failureReason: info.failureReason } : {}),
            } as NormalizedEvent);
          }, (assistantText) => {
            if (!assistantText) return;
            eventBus.emit('event', {
              schemaVersion: 1,
              sessionId,
              type: 'session_chat_message',
              provider: 'claude',
              role: 'assistant',
              content: assistantText,
              timestamp: new Date().toISOString(),
            } as NormalizedEvent);
          }, 'default', (usageSnapshot) => {
            eventBus.emit('event', {
              schemaVersion: 1,
              sessionId,
              type: 'session_usage',
              provider: 'claude',
              timestamp: new Date().toISOString(),
              inputTokens: usageSnapshot.inputTokens,
              outputTokens: usageSnapshot.outputTokens,
              totalTokens: usageSnapshot.totalTokens,
              cachedInputTokens: usageSnapshot.cachedInputTokens,
              ...(usageSnapshot.contextUsedTokens !== undefined
                ? { contextUsedTokens: usageSnapshot.contextUsedTokens }
                : {}),
              ...(usageSnapshot.contextWindowTokens !== undefined
                ? { contextWindowTokens: usageSnapshot.contextWindowTokens }
                : {}),
              ...(usageSnapshot.contextPercent !== undefined
                ? { contextPercent: usageSnapshot.contextPercent }
                : {}),
              ...(usageSnapshot.model ? { model: usageSnapshot.model } : {}),
            } as NormalizedEvent);
          }, { continueSession: true });
          runtimeRegistry.register(sessionId, {
            provider: 'claude',
            sendMessage: (message) => runtime.sendMessage(message),
            terminateSession: () => runtime.terminateSession(),
          });

          eventBus.emit('event', {
            schemaVersion: 1,
            sessionId,
            type: 'session_resumed',
            provider: 'claude',
            timestamp: new Date().toISOString(),
            resumedFromSessionId: sessionId,
            resumeSource: 'claude_continue',
            workspacePath: claudeRow!.workspace,
            ...(claudeContext.branch ? { branch: claudeContext.branch } : {}),
            ...(claudeContext.lastPrompt ? { lastPrompt: claudeContext.lastPrompt } : {}),
            providerThreadId: claudeRow!.claudeId,
          } as NormalizedEvent);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ sessionId, mode: 'resumed', provider: 'claude', resumeSource: 'claude_continue' }));
        } catch (err) {
          logger.error('resume', 'Failed to resume session', { sessionId, error: String(err) });
          if (err instanceof LaunchError) {
            res.writeHead(422, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message, error_code: err.code }));
          } else {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to resume session.' }));
          }
        }
      })();
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
          const { workspace, content, pinned, category, scope } = JSON.parse(body) as {
            workspace: string;
            content: string;
            pinned?: boolean;
            category?: string;
            scope?: string;
          };
          if (!workspace || !content) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'workspace and content required' })); return; }
          const note = insertNote(db, { workspace, content, pinned, category, scope });
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
