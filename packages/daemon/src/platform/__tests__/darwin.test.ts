import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import { darwinBackend } from '../darwin.js';

const mockExecFileSync = vi.mocked(execFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('darwinBackend.resolveBinary', () => {
  it('returns trimmed which output', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('/usr/local/bin/claude\n'));

    expect(darwinBackend.resolveBinary('claude')).toBe('/usr/local/bin/claude');
    expect(mockExecFileSync).toHaveBeenCalledWith('which', ['claude'], { stdio: 'pipe' });
  });

  it('throws when which fails', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('not found'); });

    expect(() => darwinBackend.resolveBinary('claude')).toThrow(
      'Binary not found on PATH: claude',
    );
  });
});

describe('darwinBackend.defaultSpawnOptions', () => {
  it('returns empty options', () => {
    expect(darwinBackend.defaultSpawnOptions()).toEqual({});
  });
});
