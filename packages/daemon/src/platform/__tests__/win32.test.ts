import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    accessSync: vi.fn(),
    constants: { F_OK: 0 },
  },
  existsSync: vi.fn(),
  accessSync: vi.fn(),
  constants: { F_OK: 0 },
}));

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { win32Backend } from '../win32.js';

const mockExecFileSync = vi.mocked(execFileSync);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockAccessSync = vi.mocked(fs.accessSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('win32Backend.resolveBinary', () => {
  it('resolves via where.exe when found', () => {
    mockExecFileSync.mockReturnValue(
      Buffer.from('C:\\Users\\MyUser\\.local\\bin\\claude.exe\r\n'),
    );
    mockExistsSync.mockReturnValue(true);

    expect(win32Backend.resolveBinary('claude')).toBe(
      'C:\\Users\\MyUser\\.local\\bin\\claude.exe',
    );
    expect(mockExecFileSync).toHaveBeenCalledWith('where.exe', ['claude'], { stdio: 'pipe' });
  });

  it('takes first result when where.exe returns multiple lines with same extension', () => {
    mockExecFileSync.mockReturnValue(
      Buffer.from(
        'C:\\first\\claude.exe\r\nC:\\second\\claude.exe\r\n',
      ),
    );
    mockExistsSync.mockReturnValue(true);

    expect(win32Backend.resolveBinary('claude')).toBe('C:\\first\\claude.exe');
  });

  it('prefers .cmd over extensionless when npm returns Unix script first', () => {
    // npm global installs on Windows create both an extensionless Unix shebang
    // script and a .cmd wrapper; where.exe often returns the shebang first.
    mockExecFileSync.mockReturnValue(
      Buffer.from(
        'C:\\npm\\bin\\codex\r\nC:\\npm\\bin\\codex.cmd\r\nC:\\npm\\bin\\codex.ps1\r\n',
      ),
    );
    mockExistsSync.mockReturnValue(true);

    expect(win32Backend.resolveBinary('codex')).toBe('C:\\npm\\bin\\codex.cmd');
  });

  it('falls back to manual PATH walk when where.exe throws', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('not found'); });
    mockAccessSync.mockImplementation((p) => {
      if (String(p).endsWith('claude.cmd')) return;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    vi.stubEnv('PATH', 'C:\\npm\\bin;C:\\tools');

    expect(win32Backend.resolveBinary('claude')).toBe('C:\\npm\\bin\\claude.cmd');
  });

  it('falls back to manual walk when where.exe returns nonexistent path', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('C:\\ghost\\claude.exe\r\n'));
    mockExistsSync.mockReturnValue(false);
    mockAccessSync.mockImplementation((p) => {
      if (String(p).endsWith('claude.exe')) return;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    vi.stubEnv('PATH', 'C:\\tools');

    expect(win32Backend.resolveBinary('claude')).toBe('C:\\tools\\claude.exe');
  });

  it('tries all extensions in order (.cmd, .exe, .bat, no-ext)', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error(); });
    const tried: string[] = [];
    mockAccessSync.mockImplementation((p) => {
      tried.push(String(p));
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    vi.stubEnv('PATH', 'C:\\bin');

    expect(() => win32Backend.resolveBinary('mytool')).toThrow('Binary not found on PATH: mytool');
    expect(tried).toEqual([
      'C:\\bin\\mytool.cmd',
      'C:\\bin\\mytool.exe',
      'C:\\bin\\mytool.bat',
      'C:\\bin\\mytool',
    ]);
  });

  it('throws when binary not found anywhere', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error(); });
    mockAccessSync.mockImplementation(() => { throw new Error('ENOENT'); });

    vi.stubEnv('PATH', 'C:\\bin');

    expect(() => win32Backend.resolveBinary('missing')).toThrow(
      'Binary not found on PATH: missing',
    );
  });

  it('handles empty PATH gracefully', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error(); });
    vi.stubEnv('PATH', '');

    expect(() => win32Backend.resolveBinary('claude')).toThrow('Binary not found on PATH: claude');
  });
});

describe('win32Backend.defaultSpawnOptions', () => {
  it('returns windowsHide: true and shell: true for .cmd wrappers', () => {
    expect(win32Backend.defaultSpawnOptions()).toEqual({ windowsHide: true, shell: true });
  });
});
