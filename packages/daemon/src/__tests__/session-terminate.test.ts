import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { describe, it, expect, vi } from 'vitest';
import { WebSocket } from 'ws';
import { openDatabase } from '../db/database.js';
import { persistEvent } from '../db/queries.js';
import { handleConnection } from '../ws/handlers.js';
import type { NormalizedEvent } from '@cockpit/shared';

class FakeWs extends EventEmitter {
  readyState = WebSocket.OPEN;
  sentPayloads: string[] = [];

  send(payload: string): void {
    this.sentPayloads.push(payload);
  }
}

function makeRequest(lastSeenSequence = 0): IncomingMessage {
  return { url: `/?lastSeenSequence=${lastSeenSequence}` } as IncomingMessage;
}

function makeSessionStart(
  sessionId: string,
  provider: 'claude' | 'codex',
  capabilities: {
    managedByDaemon: boolean;
    canSendMessage: boolean;
    canTerminateSession: boolean;
    reason?: string;
  },
): NormalizedEvent {
  return {
    schemaVersion: 1,
    sessionId,
    timestamp: new Date().toISOString(),
    type: 'session_start',
    provider,
    workspacePath: '/workspace/test',
    ...capabilities,
  } as NormalizedEvent;
}

describe('session_terminate websocket dispatch', () => {
  it('terminates managed sessions and emits deterministic session_end', async () => {
    const db = openDatabase(':memory:');
    const sessionId = '11111111-1111-4111-8111-111111111111';

    persistEvent(db, makeSessionStart(sessionId, 'codex', {
      managedByDaemon: true,
      canSendMessage: true,
      canTerminateSession: true,
    }));

    const ws = new FakeWs() as unknown as WebSocket;
    const terminateSession = vi.fn().mockResolvedValue(undefined);
    const emitEvent = vi.fn();

    handleConnection(ws, makeRequest(), db, {
      runtimeRegistry: {
        get: () => ({ provider: 'codex', sendMessage: vi.fn(), terminateSession }),
      },
      emitEvent,
    });

    ws.emit('message', Buffer.from(JSON.stringify({
      type: 'session_terminate',
      sessionId,
    })));

    await Promise.resolve();

    expect(terminateSession).toHaveBeenCalledTimes(1);
    expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'session_end',
      sessionId,
      provider: 'codex',
    }));

    db.close();
  });

  it('blocks terminate when capability disallows it and emits structured error', () => {
    const db = openDatabase(':memory:');
    const sessionId = '22222222-2222-4222-8222-222222222222';

    persistEvent(db, makeSessionStart(sessionId, 'claude', {
      managedByDaemon: false,
      canSendMessage: false,
      canTerminateSession: false,
      reason: 'External session is approval-only; terminate is disabled.',
    }));

    const ws = new FakeWs() as unknown as WebSocket;
    const terminateSession = vi.fn();
    const emitEvent = vi.fn();

    handleConnection(ws, makeRequest(), db, {
      runtimeRegistry: {
        get: () => ({ provider: 'claude', sendMessage: vi.fn(), terminateSession }),
      },
      emitEvent,
    });

    ws.emit('message', Buffer.from(JSON.stringify({
      type: 'session_terminate',
      sessionId,
    })));

    expect(terminateSession).not.toHaveBeenCalled();
    expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'session_chat_error',
      sessionId,
      reasonCode: 'CHAT_SEND_BLOCKED',
      reason: 'External session is approval-only; terminate is disabled.',
    }));

    db.close();
  });

  it('emits structured error when terminate runtime is missing', () => {
    const db = openDatabase(':memory:');
    const sessionId = '33333333-3333-4333-8333-333333333333';

    persistEvent(db, makeSessionStart(sessionId, 'claude', {
      managedByDaemon: true,
      canSendMessage: true,
      canTerminateSession: true,
    }));

    const ws = new FakeWs() as unknown as WebSocket;
    const emitEvent = vi.fn();

    handleConnection(ws, makeRequest(), db, {
      runtimeRegistry: {
        get: () => undefined,
      },
      emitEvent,
    });

    ws.emit('message', Buffer.from(JSON.stringify({
      type: 'session_terminate',
      sessionId,
    })));

    expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'session_chat_error',
      sessionId,
      reasonCode: 'CHAT_RUNTIME_UNAVAILABLE',
      reason: 'Managed session runtime is not available for terminate.',
    }));

    db.close();
  });
});
