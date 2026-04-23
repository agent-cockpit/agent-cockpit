import { execFileSync } from 'node:child_process';
import type { SpawnOptionsWithoutStdio } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { PlatformBackend } from './types.js';

// Windows PATH separator and executable extensions npm uses for CLI wrappers
const PATH_SEP = ';';
const WIN_EXTENSIONS = ['.cmd', '.exe', '.bat', ''];

function searchPath(name: string): string | null {
  // Try `where.exe` first — it handles PATH and PATHEXT correctly.
  // npm installs both a Unix shebang script (no extension) and a .cmd wrapper;
  // where.exe may return the extensionless script first. Prefer .cmd > .exe > .bat.
  try {
    const result = execFileSync('where.exe', [name], { stdio: 'pipe' }).toString().trim();
    const candidates = result.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const preferred = WIN_EXTENSIONS.slice(0, -1) // ['.cmd', '.exe', '.bat']
      .map((ext) => candidates.find((c) => c.toLowerCase().endsWith(ext)))
      .find(Boolean);
    const pick = preferred ?? candidates[0];
    if (pick && fs.existsSync(pick)) return pick;
  } catch {
    // where.exe not found or name not found — fall through to manual search
  }

  // Manual search: walk PATH dirs and try each extension
  const pathEnv = process.env['PATH'] ?? '';
  const dirs = pathEnv.split(PATH_SEP).filter(Boolean);

  for (const dir of dirs) {
    for (const ext of WIN_EXTENSIONS) {
      const candidate = path.win32.join(dir, name + ext);
      try {
        fs.accessSync(candidate, fs.constants.F_OK);
        return candidate;
      } catch {
        // not found at this location
      }
    }
  }

  return null;
}

export const win32Backend: PlatformBackend = {
  resolveBinary(name: string): string {
    const resolved = searchPath(name);
    if (!resolved) {
      throw new Error(`Binary not found on PATH: ${name}`);
    }
    return resolved;
  },

  defaultSpawnOptions(): Partial<SpawnOptionsWithoutStdio> {
    return {
      // Hide the console window that would otherwise appear for .cmd spawns
      windowsHide: true,
      // npm-installed CLIs on Windows are often .cmd wrappers and require
      // cmd.exe mediation; spawning directly can fail with EINVAL.
      shell: true,
    };
  },
};
