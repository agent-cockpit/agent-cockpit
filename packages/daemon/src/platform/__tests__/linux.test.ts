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
  it('returns empty options (no env override)', () => {
    const opts = linuxBackend.defaultSpawnOptions();
    expect(opts).toEqual({});
  });
});
