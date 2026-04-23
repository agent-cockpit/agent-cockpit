import type { SpawnOptionsWithoutStdio } from 'node:child_process';

export interface PlatformBackend {
  resolveBinary(name: string): string
  defaultSpawnOptions(): Partial<SpawnOptionsWithoutStdio>
}
