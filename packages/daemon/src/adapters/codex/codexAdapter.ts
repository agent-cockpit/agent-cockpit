import { spawn, type ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import type Database from 'better-sqlite3';
import type { NormalizedEvent } from '@cockpit/shared';
import { parseCodexLine, type CodexParserContext } from './codexParser.js';
import { approvalQueue } from '../../approvals/approvalQueue.js';

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

  // Map from outgoing JSON-RPC request ID → resolver
  private readonly pendingRequests = new Map<number, (result: unknown) => void>();

  // Map from Codex server integer id → { approvalId, timer }
  private readonly pendingCodexApprovals = new Map<number, { approvalId: string; timer: ReturnType<typeof setTimeout> }>();

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
    // Default factory spawns the real codex binary
    this.procFactory = procFactory ?? (() => spawn('codex', ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'] }));
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
    proc.on('exit', () => {
      this.proc = null;
      // Auto-deny all pending approvals
      for (const [, { approvalId, timer }] of this.pendingCodexApprovals) {
        clearTimeout(timer);
        codexApprovalResolvers.delete(approvalId);
      }
      this.pendingCodexApprovals.clear();
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

    // Send initialize request
    await this.sendRequest('initialize', { protocolVersion: '2024-01-01' });

    // Determine whether to start or resume
    const existing = this.db
      .prepare('SELECT thread_id FROM codex_sessions WHERE session_id = ?')
      .get(this.sessionId) as { thread_id: string } | undefined;

    if (existing?.thread_id) {
      // Resume existing thread
      try {
        await this.sendRequest('thread/resume', { threadId: existing.thread_id });
      } catch {
        // Fall back to thread/start on resume failure
        await this.sendRequest('thread/start', { workspacePath: this.workspacePath });
      }
    } else {
      // Start new thread
      const result = await this.sendRequest('thread/start', { workspacePath: this.workspacePath }) as { threadId?: string } | undefined;
      const threadId = result?.threadId;
      if (threadId) {
        this.db
          .prepare('INSERT INTO codex_sessions (session_id, thread_id, workspace, created_at) VALUES (?, ?, ?, ?)')
          .run(this.sessionId, threadId, this.workspacePath, new Date().toISOString());
      }
    }

    // Clean up readline on close
    rl?.on('close', () => { /* readline closed */ });
  }

  // -------------------------------------------------------------------------
  // resolveApproval()
  // Called by external code (e.g. resolveCodexApproval module export)
  // -------------------------------------------------------------------------
  resolveApproval(approvalId: string, decision: 'approve' | 'deny' | 'always_allow'): void {
    // Find the pending approval by approvalId
    let codexServerId: number | undefined;
    for (const [serverId, entry] of this.pendingCodexApprovals) {
      if (entry.approvalId === approvalId) {
        codexServerId = serverId;
        break;
      }
    }

    if (codexServerId === undefined) {
      // Already resolved or unknown — no-op
      return;
    }

    const entry = this.pendingCodexApprovals.get(codexServerId)!;
    clearTimeout(entry.timer);
    this.pendingCodexApprovals.delete(codexServerId);
    codexApprovalResolvers.delete(approvalId);

    // Guard: no-op if process has exited
    if (!this.proc || this.proc.killed || !this.proc.stdin?.writable) {
      return;
    }

    const codexDecision =
      decision === 'approve'
        ? 'accept'
        : decision === 'always_allow'
          ? 'acceptForSession'
          : 'decline';

    this.writeToStdin({ id: codexServerId, result: { decision: codexDecision } });
  }

  // -------------------------------------------------------------------------
  // stop()
  // -------------------------------------------------------------------------
  stop(): void {
    if (this.proc && !this.proc.killed) {
      this.proc.kill();
    }
    this.proc = null;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = nextId();
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, (result) => {
        if (result !== null && typeof result === 'object' && 'error' in (result as object)) {
          reject(new Error(String((result as Record<string, unknown>)['error'])));
        } else {
          resolve(result);
        }
      });
      this.writeToStdin({ jsonrpc: '2.0', id, method, params });
    });
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

    if (hasId && hasResult && !hasMethod) {
      // Response to our outgoing request
      const id = msg['id'] as number;
      const resolver = this.pendingRequests.get(id);
      if (resolver) {
        this.pendingRequests.delete(id);
        resolver(msg['result']);
      }
      return;
    }

    if (hasMethod && hasId && !hasResult) {
      // Server-initiated request (approval) — has both method and id
      this.handleServerRequest(msg['id'] as number, msg['method'] as string, (msg['params'] as Record<string, unknown>) ?? {});
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

  private handleServerRequest(serverId: number, method: string, params: Record<string, unknown>): void {
    // Build a line that parseCodexLine can parse for approval classification
    const fakeLine = JSON.stringify({ method, params });
    const event = parseCodexLine(fakeLine, this.parserCtx);

    if (!event || event.type !== 'approval_request') {
      return;
    }

    const { approvalId } = event as { approvalId: string };

    // 30-second auto-deny timer
    const timer = setTimeout(() => {
      this.resolveApproval(approvalId, 'deny');
    }, 30_000);

    this.pendingCodexApprovals.set(serverId, { approvalId, timer });

    // Register module-level resolver so resolveCodexApproval() can dispatch back here
    codexApprovalResolvers.set(approvalId, (decision) => {
      this.resolveApproval(approvalId, decision);
    });

    // Register with global approval queue
    approvalQueue.register(approvalId, event, this.db);

    // Emit event so UI receives it
    this.onEvent(event);
  }
}
