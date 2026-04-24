import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { describe, it, expect, vi } from 'vitest';
import { WebSocket } from 'ws';
import { openDatabase } from '../db/database.js';
import { persistEvent } from '../db/queries.js';
import { handleConnection } from '../ws/handlers.js';
import type { NormalizedEvent } from '@agentcockpit/shared';

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

describe('session_chat websocket dispatch', () => {
  it('blocks session_chat when canSendMessage=false and emits structured session_chat_error', () => {
    const db = openDatabase(':memory:');
    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000111';

    persistEvent(db, makeSessionStart(sessionId, 'claude', {
      managedByDaemon: false,
      canSendMessage: false,
      canTerminateSession: false,
      reason: 'External session is approval-only; chat send and terminate are disabled.',
    }));

    const ws = new FakeWs() as unknown as WebSocket;
    const runtimeSend = vi.fn();
    const emitEvent = vi.fn();

    handleConnection(ws, makeRequest(), db, {
      runtimeRegistry: {
        get: () => ({ provider: 'claude', sendMessage: runtimeSend }),
      },
      emitEvent,
    });

    ws.emit('message', Buffer.from(JSON.stringify({
      type: 'session_chat',
      sessionId,
      content: 'Hello from blocked session',
    })));

    expect(runtimeSend).not.toHaveBeenCalled();
    expect(emitEvent).toHaveBeenCalledTimes(1);
    expect(emitEvent.mock.calls[0]?.[0]).toMatchObject({
      type: 'session_chat_error',
      sessionId,
      reasonCode: 'CHAT_SEND_BLOCKED',
      reason: 'External session is approval-only; chat send and terminate are disabled.',
    });

    db.close();
  });

  it('dispatches session_chat when canSendMessage=true and emits normalized session_chat_message', async () => {
    const db = openDatabase(':memory:');
    const sessionId = 'bbbbbbbb-0000-0000-0000-000000000222';

    persistEvent(db, makeSessionStart(sessionId, 'codex', {
      managedByDaemon: true,
      canSendMessage: true,
      canTerminateSession: true,
    }));

    const ws = new FakeWs() as unknown as WebSocket;
    const runtimeSend = vi.fn().mockResolvedValue(undefined);
    const emitEvent = vi.fn();

    handleConnection(ws, makeRequest(), db, {
      runtimeRegistry: {
        get: () => ({ provider: 'codex', sendMessage: runtimeSend }),
      },
      emitEvent,
    });

    ws.emit('message', Buffer.from(JSON.stringify({
      type: 'session_chat',
      sessionId,
      content: 'Hello from managed session',
    })));

    expect(runtimeSend).toHaveBeenCalledWith('Hello from managed session');
    expect(emitEvent).toHaveBeenCalledTimes(1);
    expect(emitEvent.mock.calls[0]?.[0]).toMatchObject({
      type: 'session_chat_message',
      sessionId,
      role: 'user',
      content: 'Hello from managed session',
      provider: 'codex',
    });

    db.close();
  });

  it('emits assistant session_chat_message when runtime returns direct response text', async () => {
    const db = openDatabase(':memory:');
    const sessionId = 'cccccccc-0000-0000-0000-000000000333';

    persistEvent(db, makeSessionStart(sessionId, 'claude', {
      managedByDaemon: true,
      canSendMessage: true,
      canTerminateSession: true,
    }));

    const ws = new FakeWs() as unknown as WebSocket;
    const runtimeSend = vi.fn().mockResolvedValue('Hello from Claude runtime');
    const emitEvent = vi.fn();

    handleConnection(ws, makeRequest(), db, {
      runtimeRegistry: {
        get: () => ({ provider: 'claude', sendMessage: runtimeSend }),
      },
      emitEvent,
    });

    ws.emit('message', Buffer.from(JSON.stringify({
      type: 'session_chat',
      sessionId,
      content: 'Hi Claude',
    })));

    await Promise.resolve();

    expect(runtimeSend).toHaveBeenCalledWith('Hi Claude');
    expect(emitEvent).toHaveBeenCalledTimes(2);
    expect(emitEvent.mock.calls[0]?.[0]).toMatchObject({
      type: 'session_chat_message',
      sessionId,
      role: 'user',
      content: 'Hi Claude',
      provider: 'claude',
    });
    expect(emitEvent.mock.calls[1]?.[0]).toMatchObject({
      type: 'session_chat_message',
      sessionId,
      role: 'assistant',
      content: 'Hello from Claude runtime',
      provider: 'claude',
    });

    db.close();
  });
});
