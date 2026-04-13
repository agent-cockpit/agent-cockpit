import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import fs from 'node:fs';
import { openDatabase } from '../db/database.js';
import { getClaudeSessionId } from '../db/queries.js';

// Mock fs.writeFileSync to avoid writing real files
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      writeFileSync: vi.fn(),
      existsSync: vi.fn(() => true),
    },
  };
});

function makeMockProc(opts: {
  emitSpawn?: boolean;
  emitError?: Error;
  exitCode?: number;
} = {}): ChildProcess {
  const proc = new EventEmitter() as unknown as ChildProcess;
  (proc as unknown as Record<string, unknown>).unref = vi.fn();
  (proc as unknown as Record<string, unknown>).stdout = new EventEmitter();
  (proc as unknown as Record<string, unknown>).stderr = new EventEmitter();
  (proc as unknown as Record<string, unknown>).stdin = null;
  // Prevent unhandled error events on the emitter itself
  proc.on('error', () => { /* handled by launch() wrapper */ });

  // Schedule events async so the promise wrapper is set up first
  setTimeout(() => {
    if (opts.emitError) {
      proc.emit('error', opts.emitError);
    } else if (opts.exitCode !== undefined && opts.exitCode !== 0) {
      // emit stderr then close with non-zero exit
      (proc as unknown as { stderr: EventEmitter }).stderr.emit('data', Buffer.from('spawn error output'));
      proc.emit('exit', opts.exitCode, null);
    } else if (opts.emitSpawn !== false) {
      proc.emit('spawn');
    }
  }, 0);

  return proc;
}

describe('ClaudeLauncher.launch()', () => {
  let db: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    db = openDatabase(':memory:');
    vi.clearAllMocks();
  });

  it('writes a temp settings JSON file before spawning', async () => {
    const { ClaudeLauncher } = await import('../adapters/claude/claudeLauncher.js');
    const mockProc = makeMockProc({ emitSpawn: true });
    const procFactory = vi.fn(() => mockProc);
    const launcher = new ClaudeLauncher(3333, db, procFactory);

    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000001';
    await launcher.launch(sessionId, '/tmp');

    const expectedPath = `${os.tmpdir()}/cockpit-claude-${sessionId}.json`;
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
      expectedPath,
      expect.any(String),
    );
  });

  it('written settings file contains all 8 hook event types pointing to daemon port', async () => {
    const { ClaudeLauncher } = await import('../adapters/claude/claudeLauncher.js');
    const mockProc = makeMockProc({ emitSpawn: true });
    const procFactory = vi.fn(() => mockProc);
    const launcher = new ClaudeLauncher(4444, db, procFactory);

    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000002';
    await launcher.launch(sessionId, '/tmp');

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    expect(writeCall).toBeDefined();
    const written = JSON.parse(writeCall[1] as string) as {
      hooks: Record<string, Array<{ url: string; timeout?: number }>>;
    };

    const hookUrl = 'http://localhost:4444/hook';
    const hookEvents = [
      'SessionStart', 'SessionEnd', 'PreToolUse', 'PostToolUse',
      'PermissionRequest', 'SubagentStart', 'SubagentStop', 'Notification',
    ];
    for (const event of hookEvents) {
      expect(written.hooks[event]).toBeDefined();
      expect(written.hooks[event][0].url).toBe(hookUrl);
    }
    // PreToolUse and PermissionRequest have timeout: 60
    expect(written.hooks['PreToolUse'][0].timeout).toBe(60);
    expect(written.hooks['PermissionRequest'][0].timeout).toBe(60);
  });

  it('calls spawn with --session-id and --settings args', async () => {
    const { ClaudeLauncher } = await import('../adapters/claude/claudeLauncher.js');
    const mockProc = makeMockProc({ emitSpawn: true });
    const procFactory = vi.fn(() => mockProc);
    const launcher = new ClaudeLauncher(3333, db, procFactory);

    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000003';
    await launcher.launch(sessionId, '/tmp');

    expect(procFactory).toHaveBeenCalledTimes(1);
    const [args] = procFactory.mock.calls[0] as [string[], unknown];
    expect(args).toContain('--session-id');
    expect(args).toContain(sessionId);
    expect(args).toContain('--settings');
    expect(args).toContain(`${os.tmpdir()}/cockpit-claude-${sessionId}.json`);
  });

  it('pre-registers sessionId mapping in DB so hookParser finds it on Tier 2', async () => {
    const { ClaudeLauncher } = await import('../adapters/claude/claudeLauncher.js');
    const mockProc = makeMockProc({ emitSpawn: true });
    const procFactory = vi.fn(() => mockProc);
    const launcher = new ClaudeLauncher(3333, db, procFactory);

    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000004';
    await launcher.launch(sessionId, '/workspace');

    // After launch, DB should map sessionId → sessionId
    const stored = getClaudeSessionId(db, sessionId);
    expect(stored).toBe(sessionId);
  });

  it('rejects with LaunchError MISSING_BINARY when spawn emits ENOENT error', async () => {
    const { ClaudeLauncher, LaunchError } = await import('../adapters/claude/claudeLauncher.js');
    const spawnErr = new Error('ENOENT') as NodeJS.ErrnoException;
    spawnErr.code = 'ENOENT';
    const mockProc = makeMockProc({ emitError: spawnErr });
    const procFactory = vi.fn(() => mockProc);
    const launcher = new ClaudeLauncher(3333, db, procFactory);

    let caught: unknown;
    try {
      await launcher.launch('session-x', '/tmp');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(LaunchError);
    expect((caught as InstanceType<typeof LaunchError>).code).toBe('MISSING_BINARY');
  });

  it('rejects with LaunchError SPAWN_FAILED when process exits with non-zero code', async () => {
    const { ClaudeLauncher, LaunchError } = await import('../adapters/claude/claudeLauncher.js');
    const mockProc = makeMockProc({ exitCode: 1 });
    const procFactory = vi.fn(() => mockProc);
    const launcher = new ClaudeLauncher(3333, db, procFactory);

    let caught: unknown;
    try {
      await launcher.launch('session-fail', '/tmp');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(LaunchError);
    expect((caught as InstanceType<typeof LaunchError>).code).toBe('SPAWN_FAILED');
  });
});
