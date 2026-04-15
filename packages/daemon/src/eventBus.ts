import { EventEmitter } from 'node:events';
import type { NormalizedEvent } from '@cockpit/shared';

// Typed event emitter for the daemon's internal event pipeline.
// Adapters emit here; the daemon's index.ts subscribes to persist and broadcast.
class DaemonEventBus extends EventEmitter {
  emit(event: 'event', data: NormalizedEvent): boolean;
  emit(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }

  on(event: 'event', listener: (data: NormalizedEvent) => void): this;
  on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }
}

export const eventBus = new DaemonEventBus();
