import { describe, it, expect, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  resolveClaudeMdPath,
  resolveAutoMemoryPath,
  readFileSafe,
  writeFileSafe,
} from '../memory/memoryReader.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-mem-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe('resolveClaudeMdPath', () => {
  it('returns workspacePath/CLAUDE.md when that file exists', () => {
    const dir = makeTmpDir();
    const primary = path.join(dir, 'CLAUDE.md');
    fs.writeFileSync(primary, '# Primary', 'utf-8');

    expect(resolveClaudeMdPath(dir)).toBe(primary);
  });

  it('returns workspacePath/.claude/CLAUDE.md when primary does not exist', () => {
    const dir = makeTmpDir();
    const fallback = path.join(dir, '.claude', 'CLAUDE.md');
    fs.mkdirSync(path.dirname(fallback), { recursive: true });
    fs.writeFileSync(fallback, '# Fallback', 'utf-8');

    expect(resolveClaudeMdPath(dir)).toBe(fallback);
  });
});

describe('readFileSafe', () => {
  it('returns file content when file exists', () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, 'test.txt');
    fs.writeFileSync(filePath, 'hello world', 'utf-8');

    expect(readFileSafe(filePath)).toBe('hello world');
  });

  it('returns null for a missing file (ENOENT)', () => {
    const missing = path.join(os.tmpdir(), 'cockpit-does-not-exist-' + Date.now() + '.txt');
    expect(readFileSafe(missing)).toBeNull();
  });
});

describe('resolveAutoMemoryPath', () => {
  it('normalizes POSIX workspace paths to a stable encoded project key', () => {
    const memoryPath = resolveAutoMemoryPath('/Users/test/my-project');
    expect(memoryPath).toContain(path.join('.claude', 'projects', 'Users-test-my-project', 'memory', 'MEMORY.md'));
  });

  it('normalizes Windows workspace paths and strips invalid filename characters', () => {
    const memoryPath = resolveAutoMemoryPath('C:\\Users\\Test User\\my-project');
    expect(memoryPath).toContain(path.join('.claude', 'projects', 'c-Users-Test-User-my-project', 'memory', 'MEMORY.md'));
  });
});

describe('writeFileSafe', () => {
  it('creates parent directories and writes content', () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, 'nested', 'deep', 'file.md');

    writeFileSafe(filePath, '# Content');

    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('# Content');
  });
});
