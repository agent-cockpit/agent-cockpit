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
  const sessionStartRow = db.prepare(
    `SELECT payload
     FROM events
     WHERE session_id = ?
       AND type = 'session_start'
       AND JSON_EXTRACT(payload, '$.workspacePath') != ''
     ORDER BY sequence_number ASC
     LIMIT 1`,
  ).get(sessionId) as { payload: string } | undefined;

  if (sessionStartRow) {
    try {
      const parsed = JSON.parse(sessionStartRow.payload) as { workspacePath?: string };
      if (parsed.workspacePath && parsed.workspacePath.length > 0) {
        return parsed.workspacePath;
      }
    } catch {
      // Fall through to table fallbacks.
    }
  }

  const claudeRow = db.prepare(
    'SELECT workspace FROM claude_sessions WHERE session_id = ? LIMIT 1',
  ).get(sessionId) as { workspace?: string } | undefined;
  if (claudeRow?.workspace) return claudeRow.workspace;

  const codexRow = db.prepare(
    'SELECT workspace FROM codex_sessions WHERE session_id = ? LIMIT 1',
  ).get(sessionId) as { workspace?: string } | undefined;
  if (codexRow?.workspace) return codexRow.workspace;

  return null;
}
