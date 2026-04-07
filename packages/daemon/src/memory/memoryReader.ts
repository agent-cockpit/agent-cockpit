import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export function resolveClaudeMdPath(workspacePath: string): string {
  const primary = path.join(workspacePath, 'CLAUDE.md');
  return fs.existsSync(primary) ? primary : path.join(workspacePath, '.claude', 'CLAUDE.md');
}

export function resolveAutoMemoryPath(workspacePath: string): string {
  const encoded = workspacePath.replace(/^\//, '').replace(/\//g, '-');
  return path.join(os.homedir(), '.claude', 'projects', encoded, 'memory', 'MEMORY.md');
}

export function readFileSafe(filePath: string): string | null {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return null; }
}

export function writeFileSafe(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}
