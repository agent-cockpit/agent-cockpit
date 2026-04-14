import fs from 'node:fs';
import os from 'node:os';
import { execFile, execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type Database from 'better-sqlite3';
import { setClaudeSessionId } from '../../db/queries.js';

export class LaunchError extends Error {
  constructor(
    public readonly code: 'INVALID_WORKSPACE' | 'MISSING_BINARY' | 'AUTH_FAILED' | 'SPAWN_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'LaunchError';
  }
}

type ProcFactory = (args: string[], opts: object) => ChildProcess;

export interface ManagedClaudeRuntime {
  sendMessage: (message: string) => Promise<string | void>
  terminateSession: () => void
  isActive: () => boolean
}

export class ClaudeLauncher {
  private readonly db: Database.Database | null;
  private readonly procFactory: ProcFactory | undefined;

  constructor(
    private readonly hookPort: number,
    db: Database.Database | null = null,
    procFactory?: ProcFactory,
  ) {
    this.db = db;
    this.procFactory = procFactory;
  }

  async preflight(workspacePath: string): Promise<void> {
    if (!fs.existsSync(workspacePath)) {
      throw new LaunchError('INVALID_WORKSPACE', `Workspace path does not exist: ${workspacePath}`);
    }
    try {
      execFileSync('which', ['claude'], { stdio: 'pipe' });
    } catch {
      throw new LaunchError('MISSING_BINARY', 'claude binary not found on PATH');
    }
    try {
      execFileSync('which', ['expect'], { stdio: 'pipe' });
    } catch {
      throw new LaunchError('MISSING_BINARY', 'expect binary not found on PATH');
    }
  }

  async launch(sessionId: string, workspacePath: string): Promise<ManagedClaudeRuntime> {
    // 1. Build settings object — claude hook format uses type:"command" with curl, not type:"http"
    const hookCmd = `curl -sf -X POST http://localhost:${this.hookPort}/hook -d @- -H 'Content-Type: application/json'`;
    const hookEntry = (matcher?: string) => ({
      ...(matcher !== undefined ? { matcher } : {}),
      hooks: [{ type: 'command', command: hookCmd }],
    });
    const settings = {
      hooks: {
        SessionStart: [hookEntry()],
        SessionEnd: [hookEntry()],
        PreToolUse: [hookEntry('')],
        PostToolUse: [hookEntry('')],
        PermissionRequest: [hookEntry('')],
        SubagentStart: [hookEntry()],
        SubagentStop: [hookEntry()],
        Notification: [hookEntry()],
      },
    };

    // 2. Write settings to temp file
    const settingsPath = `${os.tmpdir()}/cockpit-claude-${sessionId}.json`;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // 3. Pre-register the session ID mapping before spawning so hookParser finds it on Tier 1/2
    if (this.db) {
      setClaudeSessionId(this.db, sessionId, sessionId, workspacePath);
    }

    // 4. Spawn claude through an expect-managed PTY.
    // Claude requires a TTY for interactive sessions; daemon sockets do not provide one.
    // `expect` is used as a stable PTY bridge so we can still write prompts via stdin.
    console.log(`[ClaudeLauncher] spawning claude --session-id ${sessionId} --settings ${settingsPath} in cwd=${workspacePath}`);
    const claudeArgs = ['--session-id', sessionId, '--settings', settingsPath];
    const spawnOpts = { cwd: workspacePath, stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'], detached: true };
    const expectScript = [
      'log_user 0',
      'set timeout -1',
      'spawn -noecho claude --session-id $env(COCKPIT_CLAUDE_SESSION_ID) --settings $env(COCKPIT_CLAUDE_SETTINGS_PATH)',
      'interact',
    ].join('\n');

    const proc = this.procFactory
      ? this.procFactory(claudeArgs, spawnOpts)
      : spawn('expect', ['-c', expectScript], {
        ...spawnOpts,
        env: {
          ...process.env,
          COCKPIT_CLAUDE_SESSION_ID: sessionId,
          COCKPIT_CLAUDE_SETTINGS_PATH: settingsPath,
        },
      });

    proc.unref();

    // 5. Wrap in a Promise that resolves only after startup stability.
    // A spawned process can still fail immediately; keep launch pending briefly
    // so callers don't register a dead runtime.
    return new Promise<ManagedClaudeRuntime>((resolve, reject) => {
      let settled = false;
      let stderr = '';
      let startupTimer: NodeJS.Timeout | null = null;

      const settleResolve = (runtime: ManagedClaudeRuntime): void => {
        if (settled) return;
        settled = true;
        if (startupTimer) clearTimeout(startupTimer);
        resolve(runtime);
      };

      const settleReject = (error: LaunchError): void => {
        if (settled) return;
        settled = true;
        if (startupTimer) clearTimeout(startupTimer);
        reject(error);
      };

      const stderrStream = proc.stderr;
      if (stderrStream) {
        stderrStream.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          stderr += text;
          console.error(`[ClaudeLauncher] stderr: ${text.trim()}`);
        });
      }

      proc.once('spawn', () => {
        console.log(`[ClaudeLauncher] claude process spawned (pid=${proc.pid})`);
        startupTimer = setTimeout(() => {
          if (proc.exitCode !== null && proc.exitCode !== undefined) {
            settleReject(new LaunchError('SPAWN_FAILED', `claude exited during startup with code ${proc.exitCode}: ${stderr}`));
            return;
          }
          settleResolve({
            sendMessage: async (message: string) => {
              const hasExited = proc.exitCode !== null && proc.exitCode !== undefined;
              if (!proc.stdin?.writable || proc.killed || hasExited) {
                throw new LaunchError('SPAWN_FAILED', 'claude runtime is not available for chat send');
              }
              const content = message.trim();
              if (!content) return;
              try {
                const response = await runPrintMessage(sessionId, workspacePath, content);
                if (response.length > 0) {
                  return response;
                }
              } catch (err) {
                console.error('[ClaudeLauncher] print fallback failed, writing to PTY stdin:', err);
              }
              proc.stdin.write(`${content}\n`);
            },
            terminateSession: () => {
              if (!proc.killed) {
                proc.kill();
              }
            },
            isActive: () => !proc.killed && (proc.exitCode === null || proc.exitCode === undefined),
          });
        }, 500);
      });

      proc.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          settleReject(new LaunchError('MISSING_BINARY', `claude binary not found: ${err.message}`));
        } else {
          settleReject(new LaunchError('SPAWN_FAILED', `Failed to spawn claude: ${err.message}`));
        }
      });

      proc.once('exit', (code, signal) => {
        if (!settled) {
          if (signal) {
            settleReject(new LaunchError('SPAWN_FAILED', `claude exited during startup on signal ${signal}: ${stderr}`));
            return;
          }
          settleReject(new LaunchError('SPAWN_FAILED', `claude exited during startup with code ${code ?? 'unknown'}: ${stderr}`));
        }
      });
    });
  }
}

function runPrintMessage(sessionId: string, workspacePath: string, message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '--session-id',
      sessionId,
      '--print',
      '--output-format',
      'text',
      message,
    ];
    execFile(
      'claude',
      args,
      {
        cwd: workspacePath,
        timeout: 120_000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new LaunchError('SPAWN_FAILED', `claude --print failed: ${(stderr || error.message).trim()}`));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}
