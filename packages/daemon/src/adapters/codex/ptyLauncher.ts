import pty from 'node-pty';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import type Database from 'better-sqlite3';
import { parseCodexLine, type CodexParserContext } from './codexParser.js';
import { approvalQueue } from '../../approvals/approvalQueue.js';
import { registerCodexApprovalResolver, deregisterCodexApprovalResolver } from './codexAdapter.js';
import { platform } from '../../platform/index.js';
import { logger } from '../../logger.js';

export interface CodexPtyRuntime {
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
  isActive: () => boolean
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Could not determine free port')));
      }
    });
    server.on('error', reject);
  });
}

function buildApprovalResult(
  method: string,
  params: Record<string, unknown>,
  decision: 'approve' | 'deny' | 'always_allow',
): Record<string, unknown> {
  if (method === 'execCommandApproval' || method === 'applyPatchApproval') {
    const d = decision === 'approve' ? 'approved' : decision === 'always_allow' ? 'approved_for_session' : 'denied';
    return { decision: d };
  }
  if (method === 'item/permissions/requestApproval') {
    const permissions =
      params['permissions'] && typeof params['permissions'] === 'object'
        ? (params['permissions'] as Record<string, unknown>)
        : {};
    if (decision === 'deny') return { scope: 'turn', permissions: {} };
    return { scope: decision === 'always_allow' ? 'session' : 'turn', permissions };
  }
  const d = decision === 'approve' ? 'accept' : decision === 'always_allow' ? 'acceptForSession' : 'decline';
  return { decision: d };
}

function parseDecisionFromResult(result: unknown): 'approve' | 'deny' | 'always_allow' {
  if (!result || typeof result !== 'object') return 'approve';
  const r = result as Record<string, unknown>;
  const d = r['decision'];
  if (d === 'denied' || d === 'decline') return 'deny';
  if (d === 'approved_for_session' || d === 'acceptForSession') return 'always_allow';
  if (typeof r['scope'] === 'string') {
    if (r['scope'] === 'session') return 'always_allow';
    const perms = r['permissions'];
    if (!perms || (typeof perms === 'object' && Object.keys(perms as object).length === 0)) return 'deny';
  }
  return 'approve';
}

export class CodexPtyLauncher {
  async launch(
    sessionId: string,
    workspacePath: string,
    onData: (data: string) => void,
    onExit: () => void,
    db: Database.Database,
    cols = 80,
    rows = 24,
    onEvent?: (event: import('@agentcockpit/shared').NormalizedEvent) => void,
  ): Promise<CodexPtyRuntime> {
    const proxyPort = await getFreePort();

    let codexPath: string;
    try {
      codexPath = platform.resolveBinary('codex');
    } catch {
      throw new Error('codex binary not found on PATH');
    }

    // Spawn codex app-server in stdio (JSON-RPC) mode
    const appServerProc = spawn(codexPath, ['app-server'], {
      cwd: workspacePath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const parserCtx: CodexParserContext = {
      sessionId,
      workspacePath,
      sessionStartEmitted: true, // session_start already emitted by the server
    };

    // Maps serverRequestId → { approvalId, method, params }
    const pendingApprovals = new Map<string | number, {
      approvalId: string;
      method: string;
      params: Record<string, unknown>;
    }>();
    const resolvedRequestIds = new Set<string | number>();

    // WebSocket proxy — codex --remote connects here
    const proxyClients = new Set<WebSocket>();
    const wss = new WebSocketServer({ host: '127.0.0.1', port: proxyPort });

    function writeToAppServer(msg: unknown): void {
      if (appServerProc.stdin?.writable) {
        appServerProc.stdin.write(JSON.stringify(msg) + '\n');
      }
    }

    function broadcastToTui(msg: unknown): void {
      const data = JSON.stringify(msg);
      for (const ws of proxyClients) {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      }
    }

    // Intercept messages from app-server → forward to TUI, tap approvals
    function handleFromAppServer(line: string): void {
      const trimmed = line.trim();
      if (!trimmed) return;

      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        return;
      }

      const hasId = 'id' in msg && msg['id'] !== null && msg['id'] !== undefined;
      const hasMethod = typeof msg['method'] === 'string';
      const hasResult = 'result' in msg;
      const hasError = 'error' in msg;

      // Server-initiated request (approval): has method + id, no result/error
      if (hasMethod && hasId && !hasResult && !hasError) {
        const method = msg['method'] as string;
        const params = (msg['params'] as Record<string, unknown>) ?? {};
        const serverRequestId = msg['id'] as string | number;

        const fakeLine = JSON.stringify({ id: serverRequestId, method, params });
        const event = parseCodexLine(fakeLine, parserCtx);

        if (event?.type === 'approval_request') {
          const approvalEvent = event as typeof event & { approvalId: string };
          const { approvalId } = approvalEvent;
          pendingApprovals.set(serverRequestId, { approvalId, method, params });

          // Register resolver — called when Cockpit UI decides
          registerCodexApprovalResolver(approvalId, (decision) => {
            if (resolvedRequestIds.has(serverRequestId)) return;
            resolvedRequestIds.add(serverRequestId);
            pendingApprovals.delete(serverRequestId);

            const result = buildApprovalResult(method, params, decision);
            const response = { id: serverRequestId, result };
            writeToAppServer(response);
            broadcastToTui(response); // Let TUI dismiss the prompt
          });

          approvalQueue.register(approvalId, event, db);
        } else if (event && onEvent) {
          onEvent(event);
        }
      }

      // Notification (method, no id): parse and emit non-approval events (file_change, usage, chat, etc.)
      if (hasMethod && !hasId && !hasResult && !hasError && onEvent) {
        const event = parseCodexLine(trimmed, parserCtx);
        if (event && event.type !== 'approval_request') {
          onEvent(event);
        }
      }

      broadcastToTui(msg);
    }

    // Intercept messages from TUI → forward to app-server, tap approval responses
    function handleFromTui(rawData: string): void {
      const trimmed = rawData.trim();
      if (!trimmed) return;

      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        writeToAppServer(rawData);
        return;
      }

      const hasId = 'id' in msg && msg['id'] !== null && msg['id'] !== undefined;
      const hasMethod = typeof msg['method'] === 'string';
      const hasResult = 'result' in msg;

      // TUI is responding to a server request (user approved/denied in terminal)
      if (hasId && hasResult && !hasMethod) {
        const serverRequestId = msg['id'] as string | number;
        const pending = pendingApprovals.get(serverRequestId);

        if (pending) {
          if (resolvedRequestIds.has(serverRequestId)) {
            // Already resolved by Cockpit UI — skip duplicate
            return;
          }
          resolvedRequestIds.add(serverRequestId);
          pendingApprovals.delete(serverRequestId);

          // Remove Cockpit resolver so approvalQueue.decide won't double-respond
          deregisterCodexApprovalResolver(pending.approvalId);

          const decision = parseDecisionFromResult(msg['result']);
          approvalQueue.decide(pending.approvalId, decision, db);
        }
      }

      writeToAppServer(msg);
    }

    wss.on('connection', (ws) => {
      proxyClients.add(ws);
      logger.info('codex-pty', 'TUI client connected to proxy', { sessionId, proxyPort });
      ws.on('message', (data) => handleFromTui(data.toString()));
      ws.on('close', () => { proxyClients.delete(ws); });
      ws.on('error', () => { proxyClients.delete(ws); });
    });

    let stdoutBuf = '';
    appServerProc.stdout?.setEncoding('utf8');
    appServerProc.stdout?.on('data', (chunk: string) => {
      stdoutBuf += chunk;
      let idx: number;
      while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, idx);
        stdoutBuf = stdoutBuf.slice(idx + 1);
        handleFromAppServer(line);
      }
    });

    appServerProc.stderr?.setEncoding('utf8');
    appServerProc.stderr?.on('data', (chunk: string) => {
      const text = chunk.trim();
      if (text) logger.warn('codex-pty', '[app-server stderr]', { sessionId, text: text.slice(0, 200) });
    });

    appServerProc.on('error', (err) => {
      logger.error('codex-pty', 'app-server process error', { sessionId, error: err.message });
    });

    // Wait for proxy WS server to be ready before spawning the PTY
    await new Promise<void>((resolve) => { wss.once('listening', resolve); });

    // Spawn codex --remote ws://127.0.0.1:PORT in PTY
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) env[k] = v;
    }

    const isWindows = process.platform === 'win32';
    const remoteUrl = `ws://127.0.0.1:${proxyPort}`;
    let spawnFile: string;
    let spawnArgs: string[];

    if (isWindows) {
      const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;
      spawnFile = 'powershell.exe';
      spawnArgs = ['-NoLogo', '-NoProfile', '-Command', `& ${psQuote(codexPath)} --remote ${psQuote(remoteUrl)}`];
    } else {
      const shQuote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
      spawnFile = process.env['SHELL'] ?? '/bin/zsh';
      spawnArgs = ['-l', '-c', `${shQuote(codexPath)} --remote ${shQuote(remoteUrl)}`];
      env['TERM'] = 'xterm-256color';
      env['COLORTERM'] = 'truecolor';
    }

    let active = true;

    function cleanup(): void {
      wss.close();
      for (const ws of proxyClients) { try { ws.terminate(); } catch {} }
      proxyClients.clear();
      if (!appServerProc.killed) { try { appServerProc.kill(); } catch {} }
    }

    const ptyProcess = pty.spawn(spawnFile, spawnArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: workspacePath,
      env,
    });

    ptyProcess.onData(onData);
    ptyProcess.onExit(() => {
      if (!active) return;
      active = false;
      cleanup();
      onExit();
    });

    appServerProc.on('exit', () => {
      if (!active) return;
      active = false;
      try { ptyProcess.kill(); } catch {}
      cleanup();
      onExit();
    });

    logger.info('codex-pty', 'Spawned codex PTY + proxy', { sessionId, workspacePath, proxyPort });

    return {
      write: (data) => { if (active) ptyProcess.write(data); },
      resize: (c, r) => { if (active) { try { ptyProcess.resize(c, r); } catch {} } },
      kill: () => {
        if (!active) return;
        active = false;
        try { ptyProcess.kill(); } catch {}
        cleanup();
      },
      isActive: () => active,
    };
  }
}
