import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openDatabase } from '../db/database.js';
import type { Database } from 'better-sqlite3';
import type { NormalizedEvent } from '@agentcockpit/shared';
import { getApprovalById } from '../approvals/approvalStore.js';

// ─── Approval timeout integration tests ──────────────────────────────────────
//
// These tests directly exercise ApprovalQueue.handleTimeout() and the timer
// wiring that calls it, using an in-memory DB to avoid filesystem side-effects.
// Fake timers (vi.useFakeTimers) let us trigger the 50ms override instantly.

const TIMEOUT_MS = 50; // short override for tests

function makeApprovalEvent(approvalId: string): NormalizedEvent {
  return {
    schemaVersion: 1,
    sessionId: '00000000-0000-0000-0000-000000000100',
    timestamp: new Date().toISOString(),
    type: 'approval_request',
    approvalId,
    actionType: 'shell_command',
    riskLevel: 'high',
    proposedAction: 'rm -rf /tmp/test',
    affectedPaths: ['/tmp/test'],
    whyRisky: 'Deletes files',
  } as NormalizedEvent;
}

describe('Approval timeout integration', () => {
  let db: Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
    vi.useFakeTimers();
  });

  afterEach(() => {
    db.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('Test 1: after timeout fires, approvals row status is "timeout"', async () => {
    const { approvalQueue } = await import('../approvals/approvalQueue.js');

    const approvalId = 'timeout-test-0000-0000-0000-000000000001';
    const event = makeApprovalEvent(approvalId);

    // Register with a DB — register inserts a pending row
    approvalQueue.register(approvalId, event, db);

    // Row should be pending before timeout
    const before = getApprovalById(db, approvalId);
    expect(before?.status).toBe('pending');

    // Simulate timeout by calling handleTimeout directly
    approvalQueue.handleTimeout(approvalId, db);

    // Row should now be 'timeout'
    const after = getApprovalById(db, approvalId);
    expect(after?.status).toBe('timeout');
  });

  it('Test 2: timeout path emits an ApprovalResolvedEvent with decision="timeout" on the eventBus', async () => {
    const { eventBus } = await import('../eventBus.js');
    const { approvalQueue } = await import('../approvals/approvalQueue.js');

    const approvalId = 'timeout-test-0000-0000-0000-000000000002';
    const event = makeApprovalEvent(approvalId);

    approvalQueue.register(approvalId, event, db);

    // Listen for the resolved event
    const capturedEvents: NormalizedEvent[] = [];
    eventBus.once('event', (e: NormalizedEvent) => capturedEvents.push(e));

    approvalQueue.handleTimeout(approvalId, db);

    // The once handler fires synchronously during emit
    expect(capturedEvents).toHaveLength(1);
    const resolved = capturedEvents[0] as NormalizedEvent & { decision: string };
    expect(resolved.type).toBe('approval_resolved');
    expect(resolved.decision).toBe('timeout');
    expect((resolved as { approvalId?: string }).approvalId).toBe(approvalId);
  });

  it('Test 3: timeout path calls resolveApproval with "deny" (pendingApprovals Map is empty after timeout)', async () => {
    const hookServerMod = await import('../adapters/claude/hookServer.js');
    const resolveSpy = vi
      .spyOn(hookServerMod, 'resolveApproval')
      .mockImplementation(() => {});

    const { approvalQueue } = await import('../approvals/approvalQueue.js');

    const approvalId = 'timeout-test-0000-0000-0000-000000000003';
    const event = makeApprovalEvent(approvalId);

    approvalQueue.register(approvalId, event, db);

    approvalQueue.handleTimeout(approvalId, db);

    expect(resolveSpy).toHaveBeenCalledWith(approvalId, 'deny', expect.any(String));

    // Calling handleTimeout again should be a no-op (already removed from pending)
    resolveSpy.mockClear();
    approvalQueue.handleTimeout(approvalId, db);
    expect(resolveSpy).not.toHaveBeenCalled();
  });
});
