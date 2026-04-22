import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { openDatabase } from '../db/database.js';
import { getClaudeSessionId } from '../db/queries.js';

// Mock fs.writeFileSync to avoid writing real files
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const actualWithDefault = actual as typeof actual & { default?: typeof actual };
  const baseFs = actualWithDefault.default ?? actual;
  const mockedFs = {
    ...baseFs,
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
  };

  return {
    ...actual,
    ...mockedFs,
    default: mockedFs,
  };
});

type MockProc = ChildProcessWithoutNullStreams & {
  __emitStdout: (line: string) => void;
  __emitStderr: (line: string) => void;
  __emitExit: (code?: number) => void;
};

function makeMockProc(opts: { exitDuringStartup?: boolean } = {}): MockProc {
  const proc = new EventEmitter() as any;
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();

  const stdin = {
    writable: true,
    destroyed: false,
    write: vi.fn(() => true),
  };

  proc.pid = 99999;
  proc.killed = false;
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.stdin = stdin;
  proc.kill = vi.fn(() => {
    proc.killed = true;
    proc.emit('exit', 0, null);
    return true;
  }) as unknown as ChildProcessWithoutNullStreams['kill'];

  proc.__emitStdout = (line: string) => {
    stdout.emit('data', Buffer.from(`${line}\n`, 'utf8'));
  };
  proc.__emitStderr = (line: string) => {
    stderr.emit('data', Buffer.from(`${line}\n`, 'utf8'));
  };
  proc.__emitExit = (code = 0) => {
    proc.killed = true;
    proc.emit('exit', code, null);
  };

  if (opts.exitDuringStartup) {
    setTimeout(() => proc.__emitExit(1), 0);
  }

  return proc as MockProc;
}

describe('ClaudeLauncher.launch()', () => {
  let db: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    db = openDatabase(':memory:');
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function launchReady<T>(promise: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(300);
    return promise;
  }

  it('writes a temp settings JSON file before spawning', async () => {
    const { ClaudeLauncher } = await import('../adapters/claude/claudeLauncher.js');
    const mockProc = makeMockProc();
    const procFactory = vi.fn(() => mockProc);
    const launcher = new ClaudeLauncher(3333, db, procFactory as never);

    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000001';
    await launchReady(launcher.launch(sessionId, '/tmp'));

    const expectedPath = `${os.tmpdir()}/cockpit-claude-${sessionId}.json`;
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
      expectedPath,
      expect.any(String),
    );
  });

  it('written settings file contains all required hook event types with command hook payloads', async () => {
    const { ClaudeLauncher } = await import('../adapters/claude/claudeLauncher.js');
    const mockProc = makeMockProc();
    const procFactory = vi.fn(() => mockProc);
    const launcher = new ClaudeLauncher(4444, db, procFactory as never);

    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000002';
    await launchReady(launcher.launch(sessionId, '/tmp'));

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    expect(writeCall).toBeDefined();
    const written = JSON.parse(writeCall[1] as string) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>>;
    };

    const hookEvents = [
      'SessionStart',
      'SessionEnd',
      'PreToolUse',
      'PostToolUse',
      'PermissionRequest',
      'PermissionDenied',
      'Elicitation',
      'ElicitationResult',
      'SubagentStart',
      'SubagentStop',
      'Notification',
    ];
    for (const event of hookEvents) {
      expect(written.hooks[event]).toBeDefined();
      expect(written.hooks[event][0]?.hooks[0]?.type).toBe('command');
      expect(written.hooks[event][0]?.hooks[0]?.command).toContain('http://127.0.0.1:4444/hook');
    }
    expect(written.hooks['PreToolUse'][0]?.matcher).toBe('');
    expect(written.hooks['PermissionRequest'][0]?.matcher).toBe('');
  });

  it('permissionMode=dangerously_skip uses --dangerously-skip-permissions and no --allowedTools', async () => {
    const { ClaudeLauncher } = await import('../adapters/claude/claudeLauncher.js');
    const mockProc = makeMockProc();
    const procFactory = vi.fn(() => mockProc);
    const launcher = new ClaudeLauncher(5555, db, procFactory as never);

    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000099';
    await launchReady(launcher.launch(sessionId, '/tmp', undefined, undefined, 'dangerously_skip'));

    const [, args] = (procFactory.mock.calls[0] as unknown) as [string, string[], unknown];
    expect(args).toContain('--dangerously-skip-permissions');
    expect(args).not.toContain('--permission-mode');
    expect(args).not.toContain('--allowedTools');
  });

  it('boolean skipPermissions arg remains backward compatible', async () => {
    const { ClaudeLauncher } = await import('../adapters/claude/claudeLauncher.js');
    const mockProc = makeMockProc();
    const procFactory = vi.fn(() => mockProc);
    const launcher = new ClaudeLauncher(5556, db, procFactory as never);

    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000100';
    await launchReady(launcher.launch(sessionId, '/tmp', undefined, undefined, true));

    const [, args] = (procFactory.mock.calls[0] as unknown) as [string, string[], unknown];
    expect(args).toContain('--dangerously-skip-permissions');
    expect(args).not.toContain('--allowedTools');
  });

  it('calls spawn with stream-json args, --allowedTools, --session-id and --settings', async () => {
    const { ClaudeLauncher } = await import('../adapters/claude/claudeLauncher.js');
    const mockProc = makeMockProc();
    const procFactory = vi.fn(() => mockProc);
    const launcher = new ClaudeLauncher(3333, db, procFactory as never);

    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000003';
    await launchReady(launcher.launch(sessionId, '/tmp'));

    expect(procFactory).toHaveBeenCalledTimes(1);
    const [file, args] = (procFactory.mock.calls[0] as unknown) as [string, string[], unknown];
    expect(file).toBe('claude');
    expect(args).toContain('-p');
    expect(args).toContain('--output-format=stream-json');
    expect(args).toContain('--input-format=stream-json');
    expect(args).toContain('--session-id');
    expect(args).toContain(sessionId);
    expect(args).toContain('--settings');
    expect(args).toContain(`${os.tmpdir()}/cockpit-claude-${sessionId}.json`);
    // --allowedTools must be present so Claude fires PermissionRequest for unlisted tools
    expect(args).toContain('--allowedTools');
    const allowedIdx = args.indexOf('--allowedTools');
    const allowedValue = args[allowedIdx + 1] ?? '';
    expect(allowedValue).toContain('Read');
    expect(allowedValue).toContain('Glob');
    expect(allowedValue).toContain('Grep');
    expect(allowedValue).not.toContain('Bash');
    expect(allowedValue).not.toContain('WebFetch');
    expect(allowedValue).not.toContain('WebSearch');
  });

  it('pre-registers sessionId mapping in DB so hookParser finds it on Tier 2', async () => {
    const { ClaudeLauncher } = await import('../adapters/claude/claudeLauncher.js');
    const mockProc = makeMockProc();
    const procFactory = vi.fn(() => mockProc);
    const launcher = new ClaudeLauncher(3333, db, procFactory as never);

    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000004';
    await launchReady(launcher.launch(sessionId, '/workspace'));

    const stored = getClaudeSessionId(db, sessionId);
    expect(stored).toBe(sessionId);
  });

  it('rejects with LaunchError MISSING_BINARY when spawn throws ENOENT', async () => {
    const { ClaudeLauncher, LaunchError } = await import('../adapters/claude/claudeLauncher.js');
    const procFactory = vi.fn(() => {
      const err = Object.assign(new Error('ENOENT: claude not found'), { code: 'ENOENT' });
      throw err;
    });
    const launcher = new ClaudeLauncher(3333, db, procFactory as never);

    let caught: unknown;
    try {
      await launcher.launch('session-x', '/tmp');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(LaunchError);
    expect((caught as InstanceType<typeof LaunchError>).code).toBe('MISSING_BINARY');
  });

  it('rejects with LaunchError SPAWN_FAILED when process exits with non-zero code during startup', async () => {
    const { ClaudeLauncher, LaunchError } = await import('../adapters/claude/claudeLauncher.js');
    const mockProc = makeMockProc({ exitDuringStartup: true });
    const procFactory = vi.fn(() => mockProc);
    const launcher = new ClaudeLauncher(3333, db, procFactory as never);

    const launchPromise = launcher.launch('session-fail', '/tmp');
    const caught = launchPromise.catch((e) => e);
    await vi.advanceTimersByTimeAsync(300);
    const rejected = await caught;
    expect(rejected).toBeInstanceOf(LaunchError);
    expect((rejected as InstanceType<typeof LaunchError>).code).toBe('SPAWN_FAILED');
  });

  it('sendMessage writes stream-json user payload to stdin', async () => {
    const { ClaudeLauncher } = await import('../adapters/claude/claudeLauncher.js');
    const mockProc = makeMockProc();
    const procFactory = vi.fn(() => mockProc);
    const launcher = new ClaudeLauncher(3333, db, procFactory as never);

    const runtime = await launchReady(launcher.launch('session-send', '/tmp'));

    const sendPromise = runtime.sendMessage('hello from ui');
    mockProc.__emitStdout(JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'OK' }] } }));
    mockProc.__emitStdout(JSON.stringify({ type: 'result', is_error: false, result: 'OK' }));
    await sendPromise;

    expect((mockProc.stdin.write as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    const written = ((mockProc.stdin.write as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string);
    const parsed = JSON.parse(written.trim()) as {
      type: string;
      message: { role: string; content: Array<{ type: string; text: string }> };
    };
    expect(parsed.type).toBe('user');
    expect(parsed.message.role).toBe('user');
    expect(parsed.message.content[0]?.text).toBe('hello from ui');
  });

  it('emits assistant text from assistant envelope', async () => {
    const { ClaudeLauncher } = await import('../adapters/claude/claudeLauncher.js');
    const mockProc = makeMockProc();
    const onAssistantOutput = vi.fn();
    const procFactory = vi.fn(() => mockProc);
    const launcher = new ClaudeLauncher(3333, db, procFactory as never);

    const runtime = await launchReady(launcher.launch('session-assistant', '/tmp', undefined, onAssistantOutput));

    const sendPromise = runtime.sendMessage('responda apenas OK');
    mockProc.__emitStdout(JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'OK' }] },
    }));
    mockProc.__emitStdout(JSON.stringify({ type: 'result', is_error: false, result: 'OK' }));

    await sendPromise;
    expect(onAssistantOutput).toHaveBeenCalledWith('OK');
  });

  it('streams assistant deltas and skips duplicate final assistant envelope', async () => {
    const { ClaudeLauncher } = await import('../adapters/claude/claudeLauncher.js');
    const mockProc = makeMockProc();
    const onAssistantOutput = vi.fn();
    const procFactory = vi.fn(() => mockProc);
    const launcher = new ClaudeLauncher(3333, db, procFactory as never);

    const runtime = await launchReady(launcher.launch('session-delta-stream', '/tmp', undefined, onAssistantOutput));

    const sendPromise = runtime.sendMessage('responda apenas OK');
    mockProc.__emitStdout(JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'O' } },
    }));
    mockProc.__emitStdout(JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'K' } },
    }));
    mockProc.__emitStdout(JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'OK' }] },
    }));
    mockProc.__emitStdout(JSON.stringify({ type: 'result', is_error: false, result: 'OK' }));

    await sendPromise;
    expect(onAssistantOutput).toHaveBeenCalledTimes(2);
    expect(onAssistantOutput).toHaveBeenNthCalledWith(1, 'O');
    expect(onAssistantOutput).toHaveBeenNthCalledWith(2, 'K');
  });

  it('emits result text when result is error and no assistant envelope arrived', async () => {
    const { ClaudeLauncher } = await import('../adapters/claude/claudeLauncher.js');
    const mockProc = makeMockProc();
    const onAssistantOutput = vi.fn();
    const procFactory = vi.fn(() => mockProc);
    const launcher = new ClaudeLauncher(3333, db, procFactory as never);

    const runtime = await launchReady(launcher.launch('session-error-result', '/tmp', undefined, onAssistantOutput));

    const sendPromise = runtime.sendMessage('responda apenas OK');
    mockProc.__emitStdout(JSON.stringify({
      type: 'result',
      is_error: true,
      result: "You've hit your limit · resets 2pm (America/Sao_Paulo)",
    }));

    await sendPromise;
    expect(onAssistantOutput).toHaveBeenCalledWith("You've hit your limit · resets 2pm (America/Sao_Paulo)");
  });

  it('emits cumulative usage snapshots from result envelopes', async () => {
    const { ClaudeLauncher } = await import('../adapters/claude/claudeLauncher.js');
    const mockProc = makeMockProc();
    const onUsageSnapshot = vi.fn();
    const procFactory = vi.fn(() => mockProc);
    const launcher = new ClaudeLauncher(3333, db, procFactory as never);

    const runtime = await launchReady(
      launcher.launch('session-usage-snapshots', '/tmp', undefined, undefined, 'default', onUsageSnapshot),
    );

    mockProc.__emitStdout(JSON.stringify({
      type: 'system',
      subtype: 'init',
      model: 'claude-sonnet-4-6',
    }));

    const firstTurn = runtime.sendMessage('first turn');
    mockProc.__emitStdout(JSON.stringify({
      type: 'result',
      is_error: false,
      result: 'ok',
      usage: {
        input_tokens: 100,
        output_tokens: 25,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: 5,
      },
    }));
    await firstTurn;

    expect(onUsageSnapshot).toHaveBeenCalledWith({
      model: 'claude-sonnet-4-6',
      inputTokens: 100,
      outputTokens: 25,
      totalTokens: 125,
      cachedInputTokens: 15,
      contextUsedTokens: 100,
      contextWindowTokens: 200000,
      contextPercent: 0,
    });

    const secondTurn = runtime.sendMessage('second turn');
    mockProc.__emitStdout(JSON.stringify({
      type: 'result',
      is_error: false,
      result: 'ok',
      usage: {
        input_tokens: 50,
        output_tokens: 10,
        cache_read_input_tokens: 2,
        cache_creation_input_tokens: 0,
      },
    }));
    await secondTurn;

    expect(onUsageSnapshot).toHaveBeenLastCalledWith({
      model: 'claude-sonnet-4-6',
      inputTokens: 150,
      outputTokens: 35,
      totalTokens: 185,
      cachedInputTokens: 17,
      contextUsedTokens: 50,
      contextWindowTokens: 200000,
      contextPercent: 0,
    });
  });
});
