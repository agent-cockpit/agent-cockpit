// Plan 03: Full test implementations for CodexAdapter
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Writable } from 'node:stream';
import { CodexAdapter } from '../codexAdapter.js';

// ---------------------------------------------------------------------------
// Mock child-process factory
// ---------------------------------------------------------------------------
function makeMockProc(): {
  proc: EventEmitter & {
    killed: boolean;
    stdin: Pick<Writable, 'write' | 'writable'> & { calls: string[] };
    stderr: EventEmitter | null;
    stdout: null;
    pid: number | undefined;
  };
  emitLine: (line: string) => void;
} {
  const proc = new EventEmitter() as EventEmitter & {
    killed: boolean;
    stdin: Pick<Writable, 'write' | 'writable'> & { calls: string[] };
    stderr: EventEmitter | null;
    stdout: null;
    pid: number | undefined;
  };

  const stdinCalls: string[] = [];
  proc.killed = false;
  proc.pid = 1234;
  proc.stderr = null;
  proc.stdout = null;
  proc.stdin = {
    writable: true,
    calls: stdinCalls,
    write: vi.fn((data: string) => {
      stdinCalls.push(data);
      return true;
    }),
  };

  function emitLine(line: string) {
    proc.emit('line', line);
  }

  return { proc, emitLine };
}

// ---------------------------------------------------------------------------
// Helper: drive the adapter handshake by intercepting stdin writes and
// replying automatically. Returns a helper to emit further lines.
// ---------------------------------------------------------------------------
async function startAdapter(
  adapter: CodexAdapter,
  proc: ReturnType<typeof makeMockProc>['proc'],
  emitLine: (line: string) => void,
  threadIdForResume?: string,
): Promise<void> {
  // We need to respond to outgoing requests as they arrive on stdin.
  // Use a polling-based approach: watch stdin.calls and reply for each request.
  const responded = new Set<number>();

  const autoReply = () => {
    for (const raw of proc.stdin.calls) {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(raw) as Record<string, unknown>; } catch { continue; }
      const id = msg['id'] as number | undefined;
      if (id === undefined || responded.has(id)) continue;
      responded.add(id);

      const method = msg['method'] as string | undefined;
      if (method === 'initialize') {
        emitLine(JSON.stringify({ id, result: { protocolVersion: '2024-01-01' } }));
      } else if (method === 'thread/start') {
        emitLine(JSON.stringify({ id, result: { threadId: 'thr_auto' } }));
      } else if (method === 'thread/resume') {
        emitLine(JSON.stringify({ id, result: { threadId: threadIdForResume ?? 'thr_auto' } }));
      }
    }
  };

  // Poll while start() runs
  const interval = setInterval(autoReply, 0);
  try {
    await adapter.start();
  } finally {
    clearInterval(interval);
  }
}

describe('CodexAdapter', () => {
  let mockProc: ReturnType<typeof makeMockProc>['proc'];
  let emitLine: (line: string) => void;
  let onEvent: ReturnType<typeof vi.fn>;
  let mockDb: { prepare: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    const mock = makeMockProc();
    mockProc = mock.proc;
    emitLine = mock.emitLine;
    onEvent = vi.fn();

    mockDb = {
      prepare: vi.fn((_sql: string) => ({
        run: vi.fn(),
        get: vi.fn(() => undefined),
      })),
    };
  });

  it('approval reply: resolveApproval(approvalId, approve) writes { id: serverId, result: { decision: accept } } to stdin', async () => {
    const adapter = new CodexAdapter(
      'session-001',
      '/workspace',
      mockDb as unknown as import('better-sqlite3').Database,
      onEvent,
      undefined,
      () => mockProc as unknown as import('node:child_process').ChildProcess,
    );

    await startAdapter(adapter, mockProc, emitLine);
    onEvent.mockClear();

    // Now simulate a server-initiated approval request
    const serverId = 42;
    emitLine(JSON.stringify({
      id: serverId,
      method: 'item/commandExecution/requestApproval',
      params: {
        item: { type: 'commandExecution', command: ['ls', '-la'] },
      },
    }));

    expect(onEvent).toHaveBeenCalledOnce();
    const emittedEvent = onEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(emittedEvent['type']).toBe('approval_request');
    const approvalId = emittedEvent['approvalId'] as string;

    adapter.resolveApproval(approvalId, 'approve');

    const writeCalls = mockProc.stdin.calls;
    const replyWrite = writeCalls
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find((m) => m['id'] === serverId && (m['result'] as Record<string, unknown>)?.['decision'] !== undefined);

    expect(replyWrite).toBeDefined();
    expect(replyWrite).toMatchObject({
      id: serverId,
      result: { decision: 'accept' },
    });
  });

  it('approval deny: resolveApproval(approvalId, deny) writes { id: serverId, result: { decision: decline } } to stdin', async () => {
    const adapter = new CodexAdapter(
      'session-002',
      '/workspace',
      mockDb as unknown as import('better-sqlite3').Database,
      onEvent,
      undefined,
      () => mockProc as unknown as import('node:child_process').ChildProcess,
    );

    await startAdapter(adapter, mockProc, emitLine);
    onEvent.mockClear();

    const serverId = 7;
    emitLine(JSON.stringify({
      id: serverId,
      method: 'item/commandExecution/requestApproval',
      params: {
        item: { type: 'commandExecution', command: ['rm', '-rf', '/'] },
      },
    }));

    const emittedEvent = onEvent.mock.calls[0][0] as Record<string, unknown>;
    const approvalId = emittedEvent['approvalId'] as string;

    adapter.resolveApproval(approvalId, 'deny');

    const replyWrite = mockProc.stdin.calls
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find((m) => m['id'] === serverId && (m['result'] as Record<string, unknown>)?.['decision'] !== undefined);

    expect(replyWrite).toBeDefined();
    expect(replyWrite).toMatchObject({
      id: serverId,
      result: { decision: 'decline' },
    });
  });

  it('session resume: if threadId exists in DB, calls thread/resume instead of thread/start', async () => {
    const existingThreadId = 'thr_existing_123';
    const mockDbWithThread = {
      prepare: vi.fn((sql: string) => ({
        run: vi.fn(),
        get: vi.fn(() => {
          if (sql.includes('SELECT')) {
            return { thread_id: existingThreadId };
          }
          return undefined;
        }),
      })),
    };

    const adapter = new CodexAdapter(
      'session-resume',
      '/workspace',
      mockDbWithThread as unknown as import('better-sqlite3').Database,
      onEvent,
      undefined,
      () => mockProc as unknown as import('node:child_process').ChildProcess,
    );

    await startAdapter(adapter, mockProc, emitLine, existingThreadId);

    const writtenMessages = mockProc.stdin.calls.map((s) => JSON.parse(s) as Record<string, unknown>);
    const resumeCall = writtenMessages.find((m) => m['method'] === 'thread/resume');
    expect(resumeCall).toBeDefined();
    expect(resumeCall?.['params']).toMatchObject({ threadId: existingThreadId });

    const startCall = writtenMessages.find((m) => m['method'] === 'thread/start');
    expect(startCall).toBeUndefined();
  });

  it('process guard: resolveApproval is a no-op when process has exited (no EPIPE throw)', async () => {
    const adapter = new CodexAdapter(
      'session-003',
      '/workspace',
      mockDb as unknown as import('better-sqlite3').Database,
      onEvent,
      undefined,
      () => mockProc as unknown as import('node:child_process').ChildProcess,
    );

    await startAdapter(adapter, mockProc, emitLine);
    onEvent.mockClear();

    const serverId = 99;
    emitLine(JSON.stringify({
      id: serverId,
      method: 'item/commandExecution/requestApproval',
      params: {
        item: { type: 'commandExecution', command: ['echo', 'hello'] },
      },
    }));

    const emittedEvent = onEvent.mock.calls[0][0] as Record<string, unknown>;
    const approvalId = emittedEvent['approvalId'] as string;

    // Mark process as killed
    mockProc.killed = true;
    mockProc.stdin.writable = false;

    // Should not throw
    expect(() => {
      adapter.resolveApproval(approvalId, 'approve');
    }).not.toThrow();

    // No approval reply should have been written after kill
    const replyWrite = mockProc.stdin.calls
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find((m) => m['id'] === serverId && 'result' in m);

    expect(replyWrite).toBeUndefined();
  });

  it('emits session_start after successful thread start so session appears before first turn', async () => {
    const adapter = new CodexAdapter(
      'session-start-visible',
      '/workspace',
      mockDb as unknown as import('better-sqlite3').Database,
      onEvent,
      undefined,
      () => mockProc as unknown as import('node:child_process').ChildProcess,
    );

    await startAdapter(adapter, mockProc, emitLine);

    const sessionStart = onEvent.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .find((event) => event['type'] === 'session_start');

    expect(sessionStart).toBeDefined();
    expect(sessionStart).toMatchObject({
      type: 'session_start',
      provider: 'codex',
      sessionId: 'session-start-visible',
      workspacePath: '/workspace',
    });
  });

  it('emits session_end when codex process exits after session start', async () => {
    const adapter = new CodexAdapter(
      'session-exit-visible',
      '/workspace',
      mockDb as unknown as import('better-sqlite3').Database,
      onEvent,
      undefined,
      () => mockProc as unknown as import('node:child_process').ChildProcess,
    );

    await startAdapter(adapter, mockProc, emitLine);
    onEvent.mockClear();

    mockProc.emit('exit', 0);

    const sessionEnd = onEvent.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .find((event) => event['type'] === 'session_end');

    expect(sessionEnd).toBeDefined();
    expect(sessionEnd).toMatchObject({
      type: 'session_end',
      provider: 'codex',
      sessionId: 'session-exit-visible',
      exitCode: 0,
    });
  });
});
