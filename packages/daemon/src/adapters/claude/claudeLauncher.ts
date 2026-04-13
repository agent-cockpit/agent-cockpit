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
    // 1. Build settings object with all 8 hook event types
    const hookUrl = `http://localhost:${this.hookPort}/hook`;
    const settings = {
      hooks: {
        SessionStart: [{ type: 'http', url: hookUrl }],
        SessionEnd: [{ type: 'http', url: hookUrl }],
        PreToolUse: [{ type: 'http', url: hookUrl, timeout: 60 }],
        PostToolUse: [{ type: 'http', url: hookUrl }],
        PermissionRequest: [{ type: 'http', url: hookUrl, timeout: 60 }],
        SubagentStart: [{ type: 'http', url: hookUrl }],
        SubagentStop: [{ type: 'http', url: hookUrl }],
        Notification: [{ type: 'http', url: hookUrl }],
      },
    };

    // 2. Write settings to temp file
    const settingsPath = `${os.tmpdir()}/cockpit-claude-${sessionId}.json`;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // 3. Pre-register the session ID mapping before spawning so hookParser finds it on Tier 1/2
    if (this.db) {
      setClaudeSessionId(this.db, sessionId, sessionId, workspacePath);
    }

    // 4. Spawn the claude process (cwd=workspacePath, no --workspace flag exists in claude CLI)
    console.log(`[ClaudeLauncher] spawning claude --session-id ${sessionId} --settings ${settingsPath} in cwd=${workspacePath}`);
    const args = ['--session-id', sessionId, '--settings', settingsPath];
    const spawnOpts = { cwd: workspacePath, stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'], detached: true };

    const proc = this.procFactory
      ? this.procFactory(args, spawnOpts)
      : spawn('claude', args, spawnOpts);

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
