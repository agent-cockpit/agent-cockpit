import { WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type Database from 'better-sqlite3';
import type { NormalizedEvent } from '@cockpit/shared';
import { getEventsSince, getSessionSummary } from '../db/queries.js';
import { approvalQueue } from '../approvals/approvalQueue.js';

interface ManagedRuntimeHandle {
  provider: 'claude' | 'codex'
  sendMessage: (message: string) => Promise<string | void>
}

interface ConnectionDeps {
  runtimeRegistry?: {
    get: (sessionId: string) => ManagedRuntimeHandle | undefined
  }
  emitEvent?: (event: NormalizedEvent) => void
}

export function handleConnection(
  ws: WebSocket,
  req: IncomingMessage,
  db: Database.Database,
  deps?: ConnectionDeps,
): void {
  // Parse lastSeenSequence from URL query string
  // Protocol definition: lastSeenSequence is the sequence_number of the LAST event
  // the client has already received. Query is strictly > lastSeenSequence.
  // Default 0 = "send all events" (first connection).
  const url = new URL(req.url ?? '/', 'http://localhost');
  const lastSeenSequence = parseInt(url.searchParams.get('lastSeenSequence') ?? '0', 10);

  // Catch-up replay: runs synchronously (better-sqlite3 is sync + Node is single-threaded)
  // This loop completes atomically before any new event can arrive via eventBus.
  // No async gaps allowed here — do not add await or setImmediate inside this loop.
  const missed = getEventsSince(db, lastSeenSequence);

  for (const event of missed) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  function emit(event: NormalizedEvent): void {
    if (deps?.emitEvent) {
      deps.emitEvent(event);
      return;
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  function resolveProvider(rawProvider: string | undefined, fallback?: 'claude' | 'codex'): 'claude' | 'codex' {
    if (rawProvider === 'claude' || rawProvider === 'codex') return rawProvider
    return fallback ?? 'claude'
  }

  function emitChatError(
    sessionId: string,
    provider: 'claude' | 'codex',
    reasonCode: 'CHAT_INVALID_REQUEST' | 'CHAT_SEND_BLOCKED' | 'CHAT_RUNTIME_UNAVAILABLE' | 'CHAT_SEND_FAILED',
    reason: string,
  ): void {
    emit({
      schemaVersion: 1,
      sessionId,
      timestamp: new Date().toISOString(),
      type: 'session_chat_error',
      provider,
      reasonCode,
      reason,
    });
  }

  ws.on('message', (data) => {
    let msg: unknown;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    const m = msg as Record<string, unknown>;
    if (m['type'] === 'approval_decision') {
      const approvalId = m['approvalId'];
      const decision = m['decision'];
      if (
        typeof approvalId === 'string' &&
        (decision === 'approve' || decision === 'deny' || decision === 'always_allow')
      ) {
        approvalQueue.decide(approvalId, decision, db);
      }
      return;
    }

    if (m['type'] === 'session_chat') {
      const sessionId = m['sessionId'];
      const content = m['content'];
      if (typeof sessionId !== 'string' || typeof content !== 'string' || !content.trim()) {
        emitChatError(
          typeof sessionId === 'string' ? sessionId : 'unknown-session',
          'claude',
          'CHAT_INVALID_REQUEST',
          'Invalid session_chat payload: sessionId and non-empty content are required.',
        );
        return;
      }

      const summary = getSessionSummary(db, sessionId);
      if (!summary) {
        emitChatError(sessionId, 'claude', 'CHAT_INVALID_REQUEST', 'Session not found.');
        return;
      }

      const runtime = deps?.runtimeRegistry?.get(sessionId);
      const provider = resolveProvider(summary.provider, runtime?.provider);
      console.log(`[ws/chat] incoming session_chat session=${sessionId} provider=${provider} canSend=${summary.capabilities.canSendMessage} runtime=${runtime ? 'yes' : 'no'}`);

      if (!summary.capabilities.canSendMessage) {
        emitChatError(
          sessionId,
          provider,
          'CHAT_SEND_BLOCKED',
          summary.capabilities.reason ?? 'Chat send is not permitted for this session.',
        );
        return;
      }

      if (!runtime) {
        emitChatError(
          sessionId,
          provider,
          'CHAT_RUNTIME_UNAVAILABLE',
          'Managed session runtime is not available for chat send.',
        );
        return;
      }

      emit({
        schemaVersion: 1,
        sessionId,
        timestamp: new Date().toISOString(),
        type: 'session_chat_message',
        provider,
        role: 'user',
        content: content.trim(),
      });

      void runtime.sendMessage(content.trim())
        .then((assistantMessage) => {
          if (typeof assistantMessage === 'string' && assistantMessage.trim().length > 0) {
            emit({
              schemaVersion: 1,
              sessionId,
              timestamp: new Date().toISOString(),
              type: 'session_chat_message',
              provider,
              role: 'assistant',
              content: assistantMessage.trim(),
            });
            console.log(`[ws/chat] assistant response emitted session=${sessionId} provider=${provider} chars=${assistantMessage.trim().length}`);
          }
        })
        .catch((err: unknown) => {
          console.error(`[ws/chat] send failed session=${sessionId} provider=${provider}`, err);
          emitChatError(
            sessionId,
            provider,
            'CHAT_SEND_FAILED',
            `Failed to send chat message: ${String(err)}`,
          );
        });
    }
  });

  ws.on('error', (err) => {
    console.error('[cockpit-daemon] WebSocket client error:', err.message);
  });

  ws.on('close', () => {
    // no-op for Phase 1
  });
}
