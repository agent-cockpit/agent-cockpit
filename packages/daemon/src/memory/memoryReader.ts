import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type Database from 'better-sqlite3';

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

export function getWorkspacePath(db: Database.Database, sessionId: string): string | null {
  const row = db.prepare(
    "SELECT payload FROM events WHERE session_id = ? AND type = 'session_start' LIMIT 1",
  ).get(sessionId) as { payload: string } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.payload) as { workspacePath?: string };
    return parsed.workspacePath ?? null;
  } catch { return null; }
}
