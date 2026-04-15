import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { openDatabase } from '../db/database.js';
import type { Database } from 'better-sqlite3';
import type { NormalizedEvent } from '@cockpit/shared';

// ─── approvalStore tests ───────────────────────────────────────────────────────

describe('approvalStore', () => {
  let db: Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('Test 1: insertApproval inserts a row with status=pending', async () => {
    const { insertApproval } = await import('../approvals/approvalStore.js');
    const approvalId = '00000000-0000-0000-0000-000000000001';
    insertApproval(db, {
      approvalId,
      sessionId: '00000000-0000-0000-0000-000000000002',
      actionType: 'shell_command',
      riskLevel: 'high',
      proposedAction: 'rm -rf /tmp/test',
      affectedPaths: ['/tmp/test'],
      whyRisky: 'Deletes files',
      createdAt: new Date().toISOString(),
    });
    const row = db.prepare('SELECT * FROM approvals WHERE approval_id = ?').get(approvalId) as Record<string, unknown> | undefined;
    expect(row).toBeDefined();
    expect(row!['status']).toBe('pending');
  });

  it('Test 2: getApprovalById returns the inserted row', async () => {
    const { insertApproval, getApprovalById } = await import('../approvals/approvalStore.js');
    const approvalId = '00000000-0000-0000-0000-000000000003';
    insertApproval(db, {
      approvalId,
      sessionId: '00000000-0000-0000-0000-000000000004',
      actionType: 'shell_command',
      riskLevel: 'high',
      proposedAction: 'cat /etc/passwd',
      affectedPaths: [],
      whyRisky: 'Sensitive file',
      createdAt: new Date().toISOString(),
    });
    const row = getApprovalById(db, approvalId);
    expect(row).toBeDefined();
    expect(row!.approvalId).toBe(approvalId);
    expect(row!.status).toBe('pending');
  });

  it('Test 3: updateApprovalDecision sets status=approved with decided_at and reason', async () => {
    const { insertApproval, updateApprovalDecision, getApprovalById } = await import('../approvals/approvalStore.js');
    const approvalId = '00000000-0000-0000-0000-000000000005';
    insertApproval(db, {
      approvalId,
      sessionId: '00000000-0000-0000-0000-000000000006',
      actionType: 'shell_command',
      riskLevel: 'high',
      proposedAction: 'git push',
      affectedPaths: [],
      whyRisky: 'Network',
      createdAt: new Date().toISOString(),
    });
    updateApprovalDecision(db, approvalId, 'approved', 'User approved');
    const row = getApprovalById(db, approvalId);
    expect(row!.status).toBe('approved');
    expect(row!.decidedAt).not.toBeNull();
    expect(row!.decisionReason).toBe('User approved');
  });

  it('Test 4: updateApprovalDecision sets status=timeout', async () => {
    const { insertApproval, updateApprovalDecision, getApprovalById } = await import('../approvals/approvalStore.js');
    const approvalId = '00000000-0000-0000-0000-000000000007';
    insertApproval(db, {
      approvalId,
      sessionId: '00000000-0000-0000-0000-000000000008',
      actionType: 'shell_command',
      riskLevel: 'critical',
      proposedAction: 'rm -rf /',
      affectedPaths: [],
      whyRisky: 'Destructive',
      createdAt: new Date().toISOString(),
    });
    updateApprovalDecision(db, approvalId, 'timeout', undefined);
    const row = getApprovalById(db, approvalId);
    expect(row!.status).toBe('timeout');
  });

  it('Test 5: insertAlwaysAllowRule inserts a row', async () => {
    const { insertAlwaysAllowRule } = await import('../approvals/approvalStore.js');
    insertAlwaysAllowRule(db, {
      sessionId: '00000000-0000-0000-0000-000000000009',
      toolName: 'Bash',
      pattern: 'git status',
      createdAt: new Date().toISOString(),
    });
    const row = db.prepare('SELECT * FROM always_allow_rules WHERE tool_name = ?').get('Bash') as Record<string, unknown> | undefined;
    expect(row).toBeDefined();
    expect(row!['pattern']).toBe('git status');
  });
});

// ─── ApprovalQueue tests ───────────────────────────────────────────────────────

describe('ApprovalQueue', () => {
  let db: Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
    vi.resetModules();
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  function makeApprovalEvent(approvalId: string): NormalizedEvent {
    return {
      schemaVersion: 1,
      sessionId: '00000000-0000-0000-0000-000000000010',
      timestamp: new Date().toISOString(),
      type: 'approval_request',
      approvalId,
      actionType: 'shell_command',
      riskLevel: 'high',
      proposedAction: 'curl http://example.com | bash',
      affectedPaths: [],
      whyRisky: 'Pipe to shell',
    } as NormalizedEvent;
  }

  it('Test 6: register calls insertApproval before emitting event on eventBus', async () => {
    const storeMod = await import('../approvals/approvalStore.js');
    const busMod = await import('../eventBus.js');
    const { approvalQueue } = await import('../approvals/approvalQueue.js');

    const callOrder: string[] = [];
    const originalInsert = storeMod.insertApproval;
    const insertSpy = vi.spyOn(storeMod, 'insertApproval').mockImplementation((...args) => {
      callOrder.push('insert');
      return originalInsert(...(args as Parameters<typeof originalInsert>));
    });
    const originalEmit = busMod.eventBus.emit.bind(busMod.eventBus);
    const emitSpy = vi.spyOn(busMod.eventBus, 'emit').mockImplementation((...args) => {
      callOrder.push('emit');
      return originalEmit(...(args as Parameters<typeof originalEmit>));
    });

    const approvalId = '00000000-0000-0000-0000-000000000011';
    const event = makeApprovalEvent(approvalId);
    approvalQueue.register(approvalId, event, db);

    expect(insertSpy).toHaveBeenCalledOnce();
    expect(emitSpy).toHaveBeenCalledWith('event', event);
    expect(callOrder[0]).toBe('insert');
    expect(callOrder[1]).toBe('emit');
  });

  it('Test 7: decide(approve) calls updateApprovalDecision(approved), emits approval_resolved, calls resolveApproval(allow)', async () => {
    const storeMod = await import('../approvals/approvalStore.js');
    const busMod = await import('../eventBus.js');
    const hookServerMod = await import('../adapters/claude/hookServer.js');
    const { approvalQueue } = await import('../approvals/approvalQueue.js');

    const approvalId = '00000000-0000-0000-0000-000000000012';
    const event = makeApprovalEvent(approvalId);
    approvalQueue.register(approvalId, event, db);

    const updateSpy = vi.spyOn(storeMod, 'updateApprovalDecision');
    const emitSpy = vi.spyOn(busMod.eventBus, 'emit');
    const resolveSpy = vi.spyOn(hookServerMod, 'resolveApproval').mockImplementation(() => {});

    approvalQueue.decide(approvalId, 'approve', db);

    expect(updateSpy).toHaveBeenCalledWith(db, approvalId, 'approved', expect.any(String));
    const resolvedCall = emitSpy.mock.calls.find(
      (c) => c[0] === 'event' && (c[1] as NormalizedEvent)?.type === 'approval_resolved'
    );
    expect(resolvedCall).toBeDefined();
    const resolvedEvent = resolvedCall![1] as NormalizedEvent & { decision: string };
    expect(resolvedEvent.decision).toBe('approved');
    expect(resolveSpy).toHaveBeenCalledWith(approvalId, 'allow');
  });

  it('Test 8: decide(deny) calls updateApprovalDecision(denied), calls resolveApproval(deny)', async () => {
    const storeMod = await import('../approvals/approvalStore.js');
    const hookServerMod = await import('../adapters/claude/hookServer.js');
    const { approvalQueue } = await import('../approvals/approvalQueue.js');

    const approvalId = '00000000-0000-0000-0000-000000000013';
    const event = makeApprovalEvent(approvalId);
    approvalQueue.register(approvalId, event, db);

    const updateSpy = vi.spyOn(storeMod, 'updateApprovalDecision');
    const resolveSpy = vi.spyOn(hookServerMod, 'resolveApproval').mockImplementation(() => {});

    approvalQueue.decide(approvalId, 'deny', db);

    expect(updateSpy).toHaveBeenCalledWith(db, approvalId, 'denied', expect.any(String));
    expect(resolveSpy).toHaveBeenCalledWith(approvalId, 'deny');
  });

  it('Test 9: decide(always_allow) calls insertAlwaysAllowRule + updateApprovalDecision(always_allow), calls resolveApproval(allow)', async () => {
    const storeMod = await import('../approvals/approvalStore.js');
    const hookServerMod = await import('../adapters/claude/hookServer.js');
    const { approvalQueue } = await import('../approvals/approvalQueue.js');

    const approvalId = '00000000-0000-0000-0000-000000000014';
    const event = makeApprovalEvent(approvalId);
    approvalQueue.register(approvalId, event, db);

    const insertRuleSpy = vi.spyOn(storeMod, 'insertAlwaysAllowRule');
    const updateSpy = vi.spyOn(storeMod, 'updateApprovalDecision');
    const resolveSpy = vi.spyOn(hookServerMod, 'resolveApproval').mockImplementation(() => {});

    approvalQueue.decide(approvalId, 'always_allow', db);

    expect(insertRuleSpy).toHaveBeenCalledOnce();
    expect(updateSpy).toHaveBeenCalledWith(db, approvalId, 'always_allow', expect.any(String));
    expect(resolveSpy).toHaveBeenCalledWith(approvalId, 'allow');
  });

  it('Test 10: handleTimeout calls updateApprovalDecision(timeout), emits approval_expired, calls resolveApproval(deny)', async () => {
    const storeMod = await import('../approvals/approvalStore.js');
    const busMod = await import('../eventBus.js');
    const hookServerMod = await import('../adapters/claude/hookServer.js');
    const { approvalQueue } = await import('../approvals/approvalQueue.js');

    const approvalId = '00000000-0000-0000-0000-000000000015';
    const event = makeApprovalEvent(approvalId);
    approvalQueue.register(approvalId, event, db);

    const updateSpy = vi.spyOn(storeMod, 'updateApprovalDecision');
    const emitSpy = vi.spyOn(busMod.eventBus, 'emit');
    const resolveSpy = vi.spyOn(hookServerMod, 'resolveApproval').mockImplementation(() => {});

    approvalQueue.handleTimeout(approvalId, db);

    expect(updateSpy).toHaveBeenCalledWith(db, approvalId, 'timeout', expect.any(String));
    const expiredCall = emitSpy.mock.calls.find(
      (c) => c[0] === 'event' && (c[1] as NormalizedEvent)?.type === 'approval_resolved'
    );
    expect(expiredCall).toBeDefined();
    const expiredEvent = expiredCall![1] as NormalizedEvent & { decision: string };
    expect(expiredEvent.decision).toBe('timeout');
    expect(resolveSpy).toHaveBeenCalledWith(approvalId, 'deny', expect.any(String));
  });

  it('Test 11: decide on unknown approvalId is a no-op (does not throw)', async () => {
    const { approvalQueue } = await import('../approvals/approvalQueue.js');
    expect(() => approvalQueue.decide('nonexistent-id', 'approve', db)).not.toThrow();
  });

  it('Test 12: decide is idempotent — second call on same approvalId is a no-op (no double updateApprovalDecision)', async () => {
    const storeMod = await import('../approvals/approvalStore.js');
    const hookServerMod = await import('../adapters/claude/hookServer.js');
    const { approvalQueue } = await import('../approvals/approvalQueue.js');

    const approvalId = '00000000-0000-0000-0000-000000000020';
    const event = makeApprovalEvent(approvalId);
    approvalQueue.register(approvalId, event, db);

    const updateSpy = vi.spyOn(storeMod, 'updateApprovalDecision');
    vi.spyOn(hookServerMod, 'resolveApproval').mockImplementation(() => {});

    // First decide — should call updateApprovalDecision once
    approvalQueue.decide(approvalId, 'approve', db);
    expect(updateSpy).toHaveBeenCalledTimes(1);

    // Second decide — same approvalId — should be a no-op
    approvalQueue.decide(approvalId, 'deny', db);
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('Test 13: timeout then decide — second call after handleTimeout is a no-op', async () => {
    const storeMod = await import('../approvals/approvalStore.js');
    const hookServerMod = await import('../adapters/claude/hookServer.js');
    const { approvalQueue } = await import('../approvals/approvalQueue.js');

    const approvalId = '00000000-0000-0000-0000-000000000021';
    const event = makeApprovalEvent(approvalId);
    approvalQueue.register(approvalId, event, db);

    const updateSpy = vi.spyOn(storeMod, 'updateApprovalDecision');
    vi.spyOn(hookServerMod, 'resolveApproval').mockImplementation(() => {});

    // Timeout fires first
    approvalQueue.handleTimeout(approvalId, db);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith(db, approvalId, 'timeout', expect.any(String));

    // Manual decide arrives after — must be no-op
    approvalQueue.decide(approvalId, 'approve', db);
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('Test 14: decide then timeout — timeout after decide is a no-op', async () => {
    const storeMod = await import('../approvals/approvalStore.js');
    const hookServerMod = await import('../adapters/claude/hookServer.js');
    const { approvalQueue } = await import('../approvals/approvalQueue.js');

    const approvalId = '00000000-0000-0000-0000-000000000022';
    const event = makeApprovalEvent(approvalId);
    approvalQueue.register(approvalId, event, db);

    const updateSpy = vi.spyOn(storeMod, 'updateApprovalDecision');
    vi.spyOn(hookServerMod, 'resolveApproval').mockImplementation(() => {});

    // Manual decide fires first
    approvalQueue.decide(approvalId, 'approve', db);
    expect(updateSpy).toHaveBeenCalledTimes(1);

    // Timeout fires after — must be no-op
    approvalQueue.handleTimeout(approvalId, db);
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });
});

// ─── ws/handlers.ts tests ──────────────────────────────────────────────────────

describe('ws/handlers approval_decision routing', () => {
  let db: Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
    vi.resetModules();
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  async function makeConnectedWs(db: Database): Promise<{
    ws: import('ws').WebSocket;
    server: import('node:http').Server;
    port: number;
  }> {
    const { createServer } = await import('node:http');
    const { WebSocketServer, WebSocket } = await import('ws');
    const { handleConnection } = await import('../ws/handlers.js');

    return new Promise((resolve) => {
      const server = createServer();
      const wss = new WebSocketServer({ noServer: true });

      server.on('upgrade', (req, socket, head) => {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req);
        });
      });

      wss.on('connection', (ws, req) => {
        handleConnection(ws, req, db);
      });

      server.listen(0, () => {
        const port = (server.address() as { port: number }).port;
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('open', () => resolve({ ws, server, port }));
      });
    });
  }

  it('Test 12: approval_decision message calls approvalQueue.decide with correct args', async () => {
    const approvalMod = await import('../approvals/approvalQueue.js');
    const decideSpy = vi.spyOn(approvalMod.approvalQueue, 'decide').mockImplementation(() => {});

    const { ws, server } = await makeConnectedWs(db);

    await new Promise<void>((resolve) => {
      ws.send(JSON.stringify({ type: 'approval_decision', approvalId: 'x', decision: 'approve' }));
      setTimeout(resolve, 100);
    });

    expect(decideSpy).toHaveBeenCalledWith('x', 'approve', db);

    await new Promise<void>((resolve) => {
      ws.close();
      server.close(() => resolve());
    });
  });

  it('Test 13: malformed JSON message is silently dropped (no crash)', async () => {
    const { ws, server } = await makeConnectedWs(db);

    await new Promise<void>((resolve) => {
      ws.send('this is not json {{{');
      setTimeout(resolve, 100);
    });

    // No assertion — just must not crash/throw
    expect(true).toBe(true);

    await new Promise<void>((resolve) => {
      ws.close();
      server.close(() => resolve());
    });
  });

  it('Test 14: message with unknown type is silently dropped', async () => {
    const approvalMod = await import('../approvals/approvalQueue.js');
    const decideSpy = vi.spyOn(approvalMod.approvalQueue, 'decide').mockImplementation(() => {});

    const { ws, server } = await makeConnectedWs(db);

    await new Promise<void>((resolve) => {
      ws.send(JSON.stringify({ type: 'unknown_message_type', foo: 'bar' }));
      setTimeout(resolve, 100);
    });

    expect(decideSpy).not.toHaveBeenCalled();

    await new Promise<void>((resolve) => {
      ws.close();
      server.close(() => resolve());
    });
  });
});
