import { describe, it, expect } from 'vitest';
import type { NormalizedEvent } from '@agentcockpit/shared';
import { openDatabase } from '../db/database.js';
import { getAllSessions, persistEvent } from '../db/queries.js';

function makeSessionStartEvent(
  sessionId: string,
  provider: 'claude' | 'codex',
  workspacePath: string,
): NormalizedEvent {
  return {
    schemaVersion: 1,
    sessionId,
    timestamp: new Date().toISOString(),
    type: 'session_start',
    provider,
    workspacePath,
  } as NormalizedEvent;
}

describe('Session capability contract', () => {
  it('returns managed capability=true for daemon-managed codex sessions', () => {
    const db = openDatabase(':memory:');
    const sessionId = 'aaaaaaaa-0000-0000-0000-000000000011';

    db.prepare(
      'INSERT INTO codex_sessions (session_id, thread_id, workspace, created_at) VALUES (?, ?, ?, ?)',
    ).run(sessionId, 'thr-managed-1', '/workspace/managed-codex', new Date().toISOString());

    persistEvent(db, makeSessionStartEvent(sessionId, 'codex', '/workspace/managed-codex'));

    const summary = getAllSessions(db).find((s) => s.sessionId === sessionId);

    expect(summary).toBeDefined();
    expect(summary?.capabilities).toEqual({
      managedByDaemon: true,
      canSendMessage: true,
      canTerminateSession: true,
    });

    db.close();
  });

  it('returns managed capability=false with explicit reason for externally attached claude sessions', () => {
    const db = openDatabase(':memory:');
    const sessionId = 'bbbbbbbb-0000-0000-0000-000000000022';

    db.prepare(
      'INSERT INTO claude_sessions (session_id, claude_id, workspace, created_at) VALUES (?, ?, ?, ?)',
    ).run(sessionId, 'external-claude-session-id', '/workspace/external-claude', new Date().toISOString());

    persistEvent(db, makeSessionStartEvent(sessionId, 'claude', '/workspace/external-claude'));

    const summary = getAllSessions(db).find((s) => s.sessionId === sessionId);

    expect(summary).toBeDefined();
    expect(summary?.capabilities).toEqual({
      managedByDaemon: false,
      canSendMessage: false,
      canTerminateSession: false,
      reason: 'External session is approval-only; chat send and terminate are disabled.',
    });

    db.close();
  });
});
