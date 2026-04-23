import { execFileSync } from 'node:child_process';
import type { SpawnOptionsWithoutStdio } from 'node:child_process';
import type { PlatformBackend } from './types.js';

export const linuxBackend: PlatformBackend = {
  resolveBinary(name: string): string {
    try {
      return execFileSync('which', [name], { stdio: 'pipe' }).toString().trim();
    } catch {
      throw new Error(`Binary not found on PATH: ${name}`);
    }
  },

  defaultSpawnOptions(): Partial<SpawnOptionsWithoutStdio> {
    return {
      env: {
        ...process.env,
        // Prevent claude from detecting absence of a TTY and exiting early.
        // With stdio: 'pipe', TERM is unset which can trigger TTY checks in some CLIs.
        TERM: process.env['TERM'] ?? 'dumb',
      },
    };
  },
};
