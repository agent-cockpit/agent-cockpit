import { darwinBackend } from './darwin.js';
import { linuxBackend } from './linux.js';
import { win32Backend } from './win32.js';
import type { PlatformBackend } from './types.js';

function selectBackend(): PlatformBackend {
  switch (process.platform) {
    case 'darwin': return darwinBackend;
    case 'linux': return linuxBackend;
    case 'win32': return win32Backend;
    default: return darwinBackend;
  }
}

export const platform: PlatformBackend = selectBackend();
export type { PlatformBackend } from './types.js';
