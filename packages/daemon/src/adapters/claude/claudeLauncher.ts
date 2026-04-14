import fs from 'node:fs';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
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
  }

  async launch(sessionId: string, workspacePath: string): Promise<void> {
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

    // 4. Spawn the claude process via `script` to allocate a pseudo-TTY.
    // Claude detects no TTY when stdin is ignored and refuses to start interactively.
    // `script -q /dev/null claude ...` wraps the process in a PTY so claude sees a terminal.
    console.log(`[ClaudeLauncher] spawning claude --session-id ${sessionId} --settings ${settingsPath} in cwd=${workspacePath}`);
    const claudeArgs = ['--session-id', sessionId, '--settings', settingsPath];
    const args = ['-q', '/dev/null', 'claude', ...claudeArgs];
    const spawnOpts = { cwd: workspacePath, stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'], detached: true };

    const proc = this.procFactory
      ? this.procFactory(claudeArgs, spawnOpts)
      : spawn('script', args, spawnOpts);

    proc.unref();

    // 5. Wrap in a Promise that resolves on 'spawn' and rejects on error/non-zero exit
    return new Promise<void>((resolve, reject) => {
      let stderr = '';

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
        resolve();
      });

      proc.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          reject(new LaunchError('MISSING_BINARY', `claude binary not found: ${err.message}`));
        } else {
          reject(new LaunchError('SPAWN_FAILED', `Failed to spawn claude: ${err.message}`));
        }
      });

      proc.once('exit', (code) => {
        if (code !== null && code !== 0) {
          reject(new LaunchError('SPAWN_FAILED', `claude exited with code ${code}: ${stderr}`));
        }
      });
    });
  }
}
