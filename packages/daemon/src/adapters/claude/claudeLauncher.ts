import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export class LaunchError extends Error {
  constructor(
    public readonly code: 'INVALID_WORKSPACE' | 'MISSING_BINARY' | 'AUTH_FAILED' | 'SPAWN_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'LaunchError';
  }
}

export class ClaudeLauncher {
  constructor(private readonly hookPort: number) {}

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

  async launch(_sessionId: string, _workspacePath: string): Promise<void> {
    // Full implementation in Plan 02
    void this.hookPort;
  }
}
