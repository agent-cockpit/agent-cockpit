import { execFileSync } from 'node:child_process';
import type { SpawnOptionsWithoutStdio } from 'node:child_process';
import type { PlatformBackend } from './types.js';

export const darwinBackend: PlatformBackend = {
  resolveBinary(name: string): string {
    try {
      return execFileSync('which', [name], { stdio: 'pipe' }).toString().trim();
    } catch {
      throw new Error(`Binary not found on PATH: ${name}`);
    }
  },

  defaultSpawnOptions(): Partial<SpawnOptionsWithoutStdio> {
    return {};
  },
};
