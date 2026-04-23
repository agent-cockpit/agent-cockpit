import { spawn, type ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import type Database from 'better-sqlite3';
import type { NormalizedEvent } from '@cockpit/shared';
import { parseCodexLine, type CodexParserContext } from './codexParser.js';
import { approvalQueue } from '../../approvals/approvalQueue.js';
import { platform } from '../../platform/index.js';

// ---------------------------------------------------------------------------
// Module-level ID counter for outgoing JSON-RPC requests
// ---------------------------------------------------------------------------
let requestIdCounter = 1;
function nextId(): number {
  return requestIdCounter++;
}

// ---------------------------------------------------------------------------
// Module-level resolver Map for Codex approvals
// Key: approvalId (UUID). Value: function to call when decided.
// ---------------------------------------------------------------------------
const codexApprovalResolvers = new Map<string, (decision: 'approve' | 'deny' | 'always_allow') => void>();

type CodexServerRequestId = number | string;

type CodexApprovalMethod =
  | 'item/commandExecution/requestApproval'
  | 'item/fileChange/requestApproval'
  | 'item/permissions/requestApproval'
  | 'applyPatchApproval'
  | 'execCommandApproval';

type PendingCodexApprovalEntry = {
  serverRequestId: CodexServerRequestId;
  method: CodexApprovalMethod;
  params: Record<string, unknown>;
  approvalId: string;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Called by approvalQueue.decide() (and handleTimeout) alongside resolveApproval.
 * No-ops if the approvalId is not a Codex approval.
 */
export function resolveCodexApproval(
  approvalId: string,
  decision: 'approve' | 'deny' | 'always_allow',
): void {
  const resolver = codexApprovalResolvers.get(approvalId);
  if (resolver) {
    codexApprovalResolvers.delete(approvalId);
    resolver(decision);
  }
}

// ---------------------------------------------------------------------------
// CodexAdapter
// ---------------------------------------------------------------------------

export class CodexAdapter {
  private readonly sessionId: string;
  private readonly workspacePath: string;
  private readonly db: Database.Database;
  private readonly onEvent: (event: NormalizedEvent) => void;
  private readonly procFactory: () => ChildProcess;

  // proc is null after the process exits
  private proc: ChildProcess | null = null;
  private currentThreadId: string | null = null;

  // Map from outgoing JSON-RPC request ID → resolver
  private readonly pendingRequests = new Map<number, (result: unknown) => void>();

  // Map from Codex server request id → approval state
  private readonly pendingCodexApprovals = new Map<string, PendingCodexApprovalEntry>();

  // Parser context — mutated by parseCodexLine
  private readonly parserCtx: CodexParserContext;

  constructor(
    sessionId: string,
    workspacePath: string,
    db: Database.Database,
    onEvent: (event: NormalizedEvent) => void,
    _threadId?: string,                                       // unused — adapter queries DB directly
    procFactory?: () => ChildProcess,
  ) {
    this.sessionId = sessionId;
    this.workspacePath = workspacePath;
    this.db = db;
    this.onEvent = onEvent;
    this.parserCtx = { sessionId, workspacePath, sessionStartEmitted: false };
    // Default factory spawns the real codex binary using the platform-resolved path
    this.procFactory = procFactory ?? (() => {
      const codexBinary = platform.resolveBinary('codex');
      const platformOpts = platform.defaultSpawnOptions();
      return spawn(codexBinary, ['app-server'], {
        ...platformOpts,
        env: { ...process.env, ...(platformOpts.env ?? {}) },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    });
  }

  // -------------------------------------------------------------------------
  // start()
  // -------------------------------------------------------------------------
  async start(): Promise<void> {
    let proc: ChildProcess;
    try {
      proc = this.procFactory();
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'ENOENT') {
        this.onEvent({
          schemaVersion: 1,
          sessionId: this.sessionId,
          timestamp: new Date().toISOString(),
          type: 'provider_parse_error',
          provider: 'codex',
          rawPayload: '',
          errorMessage: 'codex binary not found on PATH',
        });
        return;
      }
      throw err;
    }

    this.proc = proc;

    // Handle ENOENT from spawn (async, via 'error' event)
    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        this.onEvent({
          schemaVersion: 1,
          sessionId: this.sessionId,
          timestamp: new Date().toISOString(),
          type: 'provider_parse_error',
          provider: 'codex',
          rawPayload: '',
          errorMessage: 'codex binary not found on PATH',
        });
      }
    });

    // Cleanup on exit
    proc.on('exit', (code) => {
      this.proc = null;
      this.clearPendingApprovals();

      if (this.parserCtx.sessionStartEmitted) {
        this.onEvent({
          schemaVersion: 1,
          sessionId: this.sessionId,
          provider: 'codex',
          type: 'session_end',
          exitCode: typeof code === 'number' && code !== 0 ? 1 : 0,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Build readline interface over stdout (or the proc itself for test mocks)
    const lineSource = proc.stdout ?? (proc as unknown as NodeJS.EventEmitter);
    let rl: readline.Interface | null = null;

    if (proc.stdout) {
      rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });
      rl.on('line', (line) => this.handleLine(line));
    } else {
      // Test mock path: proc emits 'line' directly
      (proc as unknown as NodeJS.EventEmitter).on('line', (line: string) => this.handleLine(line));
    }

    void lineSource; // suppress unused warning

    // Initialize handshake: initialize request followed by initialized notification.
    await this.sendRequest('initialize', {
      clientInfo: { name: 'agent-cockpit', title: 'Agent Cockpit', version: '1.0.0' },
      capabilities: null,
    });
    this.sendNotification('initialized', {});

    // Determine whether to start or resume
    const existing = this.db
      .prepare('SELECT thread_id FROM codex_sessions WHERE session_id = ?')
      .get(this.sessionId) as { thread_id: string } | undefined;

    if (existing?.thread_id) {
      // Resume existing thread
      try {
        const result = await this.sendRequest('thread/resume', { threadId: existing.thread_id });
        this.currentThreadId = this.extractThreadId(result) ?? existing.thread_id;
      } catch {
        // Fall back to thread/start on resume failure
        const result = await this.sendRequest('thread/start', this.buildThreadStartParams());
        const startedThreadId = this.extractThreadId(result);
        if (startedThreadId) {
          this.currentThreadId = startedThreadId;
          this.db
            .prepare('UPDATE codex_sessions SET thread_id = ?, workspace = ? WHERE session_id = ?')
            .run(startedThreadId, this.workspacePath, this.sessionId);
        }
      }
    } else {
      // Start new thread
      const result = await this.sendRequest('thread/start', this.buildThreadStartParams());
      const threadId = this.extractThreadId(result);
      if (threadId) {
        this.currentThreadId = threadId;
        this.db
          .prepare('INSERT INTO codex_sessions (session_id, thread_id, workspace, created_at) VALUES (?, ?, ?, ?)')
          .run(this.sessionId, threadId, this.workspacePath, new Date().toISOString());
      }
    }

    // Emit session_start even before the first turn begins so newly launched
    // Codex sessions appear in the UI immediately.
    this.emitSessionStartIfNeeded();

    // Clean up readline on close
    rl?.on('close', () => { /* readline closed */ });
  }

  // -------------------------------------------------------------------------
  // resolveApproval()
  // Called by external code (e.g. resolveCodexApproval module export)
  // -------------------------------------------------------------------------
  resolveApproval(approvalId: string, decision: 'approve' | 'deny' | 'always_allow'): void {
    // Find the pending approval by approvalId.
    let approvalEntry: PendingCodexApprovalEntry | undefined;
    let approvalKey: string | undefined;
    for (const [entryKey, entry] of this.pendingCodexApprovals) {
      if (entry.approvalId === approvalId) {
        approvalEntry = entry;
        approvalKey = entryKey;
        break;
      }
    }

    if (!approvalEntry || !approvalKey) {
      // Already resolved or unknown — no-op
      return;
    }

    clearTimeout(approvalEntry.timer);
    this.pendingCodexApprovals.delete(approvalKey);
    codexApprovalResolvers.delete(approvalId);

    // Guard: no-op if process has exited
    if (!this.proc || this.proc.killed || !this.proc.stdin?.writable) {
      return;
    }

    const resultPayload = this.buildApprovalResult(
      approvalEntry.method,
      approvalEntry.params,
      decision,
    );

    this.writeToStdin({ id: approvalEntry.serverRequestId, result: resultPayload });
  }

  // -------------------------------------------------------------------------
  // stop()
  // -------------------------------------------------------------------------
  stop(): void {
    const proc = this.proc;
    this.proc = null;
    this.currentThreadId = null;

    this.clearPendingApprovals();

    if (!proc || proc.killed) {
      return;
    }

    try {
      proc.kill();
    } catch {
      // Process may already be gone (e.g. late terminate); stop() must be safe.
    }
  }

  async sendChatMessage(message: string): Promise<void> {
    const content = message.trim();
    if (!content) return;
    if (!this.proc || this.proc.killed || !this.proc.stdin?.writable) {
      throw new Error('Codex runtime is not available for chat send');
    }
    const threadId = this.currentThreadId ?? this.loadThreadIdFromDb();
    if (!threadId) {
      throw new Error('Codex thread is not available for chat send');
    }
    await this.sendRequest('turn/start', {
      threadId,
      input: [{ type: 'text', text: content, text_elements: [] }],
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = nextId();
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, (result) => {
        if (result !== null && typeof result === 'object' && 'error' in (result as object)) {
          const rpcError = (result as Record<string, unknown>)['error'];
          const message =
            rpcError && typeof rpcError === 'object' && 'message' in (rpcError as Record<string, unknown>)
              ? String((rpcError as Record<string, unknown>)['message'])
              : String(rpcError);
          reject(new Error(message));
        } else {
          resolve(result);
        }
      });
      this.writeToStdin({ jsonrpc: '2.0', id, method, params });
    });
  }

  private sendNotification(method: string, params: Record<string, unknown>): void {
    this.writeToStdin({ jsonrpc: '2.0', method, params });
  }

  private buildThreadStartParams(): Record<string, unknown> {
    // Provide both legacy and current cwd field names for compatibility.
    return {
      workspacePath: this.workspacePath,
      cwd: this.workspacePath,
      experimentalRawEvents: false,
      persistExtendedHistory: false,
    };
  }

  private writeToStdin(msg: unknown): void {
    if (this.proc && !this.proc.killed && this.proc.stdin?.writable) {
      this.proc.stdin.write(JSON.stringify(msg) + '\n');
    }
  }

  private handleLine(line: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      // Malformed JSON — emit parse error
      this.onEvent({
        schemaVersion: 1,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        type: 'provider_parse_error',
        provider: 'codex',
        rawPayload: line,
        errorMessage: `Failed to parse line: ${line}`,
      });
      return;
    }

    const hasId = 'id' in msg && msg['id'] !== undefined && msg['id'] !== null;
    const hasMethod = 'method' in msg && msg['method'] !== undefined;
    const hasResult = 'result' in msg;
    const hasError = 'error' in msg;

    if (hasId && (hasResult || hasError) && !hasMethod) {
      // Response to our outgoing request (success or error)
      const id = msg['id'];
      if (typeof id !== 'number') return;
      const resolver = this.pendingRequests.get(id);
      if (resolver) {
        this.pendingRequests.delete(id);
        if (hasError) {
          console.error(`[CodexAdapter] rpc error for id=${id}:`, JSON.stringify(msg['error']));
        }
        resolver(hasError ? { error: msg['error'] } : msg['result']);
      }
      return;
    }

    if (hasMethod && hasId && !hasResult) {
      // Server-initiated request (approval) — has both method and id
      const requestId = msg['id'];
      if (typeof requestId !== 'number' && typeof requestId !== 'string') return;
      this.handleServerRequest(
        requestId,
        msg['method'] as string,
        (msg['params'] as Record<string, unknown>) ?? {},
      );
      return;
    }

    if (hasMethod && !hasId) {
      // Server notification (no id) — parse and emit
      const event = parseCodexLine(line, this.parserCtx);
      if (event) {
        this.onEvent(event);
      }
      return;
    }

    // Unknown message shape — no-op
  }

  private extractThreadId(result: unknown): string | undefined {
    if (!result || typeof result !== 'object') return undefined;
    const direct = (result as Record<string, unknown>)['threadId'];
    if (typeof direct === 'string') return direct;
    const thread = (result as Record<string, unknown>)['thread'];
    if (!thread || typeof thread !== 'object') return undefined;
    const nested = (thread as Record<string, unknown>)['id'];
    return typeof nested === 'string' ? nested : undefined;
  }

  private loadThreadIdFromDb(): string | null {
    const row = this.db
      .prepare('SELECT thread_id FROM codex_sessions WHERE session_id = ?')
      .get(this.sessionId) as { thread_id?: string } | undefined;
    if (typeof row?.thread_id === 'string' && row.thread_id.length > 0) {
      this.currentThreadId = row.thread_id;
      return row.thread_id;
    }
    return null;
  }

  private isApprovalMethod(method: string): method is CodexApprovalMethod {
    return method === 'item/commandExecution/requestApproval'
      || method === 'item/fileChange/requestApproval'
      || method === 'item/permissions/requestApproval'
      || method === 'applyPatchApproval'
      || method === 'execCommandApproval';
  }

  private getServerRequestKey(serverRequestId: CodexServerRequestId): string {
    return `${typeof serverRequestId}:${String(serverRequestId)}`;
  }

  private buildApprovalResult(
    method: CodexApprovalMethod,
    params: Record<string, unknown>,
    decision: 'approve' | 'deny' | 'always_allow',
  ): Record<string, unknown> {
    if (method === 'execCommandApproval' || method === 'applyPatchApproval') {
      const reviewDecision =
        decision === 'approve'
          ? 'approved'
          : decision === 'always_allow'
            ? 'approved_for_session'
            : 'denied';
      return { decision: reviewDecision };
    }

    if (method === 'item/permissions/requestApproval') {
      const requestedPermissions =
        params['permissions'] && typeof params['permissions'] === 'object'
          ? (params['permissions'] as Record<string, unknown>)
          : {};

      if (decision === 'deny') {
        return { scope: 'turn', permissions: {} };
      }

      return {
        scope: decision === 'always_allow' ? 'session' : 'turn',
        permissions: requestedPermissions,
      };
    }

    const codexDecision =
      decision === 'approve'
        ? 'accept'
        : decision === 'always_allow'
          ? 'acceptForSession'
          : 'decline';

    return { decision: codexDecision };
  }

  private handleServerRequest(serverRequestId: CodexServerRequestId, method: string, params: Record<string, unknown>): void {
    if (!this.isApprovalMethod(method)) {
      return;
    }

    // Build a line that parseCodexLine can parse for approval classification
    const fakeLine = JSON.stringify({ id: serverRequestId, method, params });
    const event = parseCodexLine(fakeLine, this.parserCtx);

    if (!event || event.type !== 'approval_request') {
      return;
    }

    const { approvalId } = event as { approvalId: string };

    // 30-second auto-deny timer
    const timer = setTimeout(() => {
      this.resolveApproval(approvalId, 'deny');
    }, 30_000);

    this.pendingCodexApprovals.set(this.getServerRequestKey(serverRequestId), {
      serverRequestId,
      method,
      params,
      approvalId,
      timer,
    });

    // Register module-level resolver so resolveCodexApproval() can dispatch back here
    codexApprovalResolvers.set(approvalId, (decision) => {
      this.resolveApproval(approvalId, decision);
    });

    // Register with global approval queue
    approvalQueue.register(approvalId, event, this.db);

    // Emit event so UI receives it
    this.onEvent(event);
  }

  private clearPendingApprovals(): void {
    for (const [, { approvalId, timer }] of this.pendingCodexApprovals) {
      clearTimeout(timer);
      codexApprovalResolvers.delete(approvalId);
    }
    this.pendingCodexApprovals.clear();
  }

  private emitSessionStartIfNeeded(): void {
    if (this.parserCtx.sessionStartEmitted) return;
    this.parserCtx.sessionStartEmitted = true;
    this.onEvent({
      schemaVersion: 1,
      sessionId: this.sessionId,
      provider: 'codex',
      workspacePath: this.workspacePath,
      type: 'session_start',
      managedByDaemon: true,
      canSendMessage: true,
      canTerminateSession: true,
      timestamp: new Date().toISOString(),
    });
  }
}
