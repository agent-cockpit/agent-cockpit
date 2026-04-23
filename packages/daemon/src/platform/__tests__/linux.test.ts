import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import { linuxBackend } from '../linux.js';

const mockExecFileSync = vi.mocked(execFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('linuxBackend.resolveBinary', () => {
  it('returns trimmed which output', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('/usr/bin/claude\n'));

    expect(linuxBackend.resolveBinary('claude')).toBe('/usr/bin/claude');
    expect(mockExecFileSync).toHaveBeenCalledWith('which', ['claude'], { stdio: 'pipe' });
  });

  it('throws when which fails', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('not found'); });

    expect(() => linuxBackend.resolveBinary('claude')).toThrow(
      'Binary not found on PATH: claude',
    );
  });
});

describe('linuxBackend.defaultSpawnOptions', () => {
  it('includes TERM env var', () => {
    const opts = linuxBackend.defaultSpawnOptions();
    expect(opts.env).toBeDefined();
    expect(opts.env!['TERM']).toBeDefined();
  });

  it('inherits process.env and sets TERM to dumb when not set', () => {
    const originalTerm = process.env['TERM'];
    delete process.env['TERM'];

    const opts = linuxBackend.defaultSpawnOptions();
    expect(opts.env!['TERM']).toBe('dumb');

    if (originalTerm !== undefined) process.env['TERM'] = originalTerm;
  });

  it('preserves existing TERM when already set', () => {
    process.env['TERM'] = 'xterm-256color';

    const opts = linuxBackend.defaultSpawnOptions();
    expect(opts.env!['TERM']).toBe('xterm-256color');
  });
});
