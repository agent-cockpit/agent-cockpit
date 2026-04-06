import type Database from 'better-sqlite3';
import type { NormalizedEvent } from '@cockpit/shared';
import { eventBus } from '../eventBus.js';
import { resolveApproval } from '../adapters/claude/hookServer.js';
import { resolveCodexApproval } from '../adapters/codex/codexAdapter.js';
import {
  insertApproval,
  updateApprovalDecision,
  insertAlwaysAllowRule,
} from './approvalStore.js';

// Module-level set tracking active (pending) approval IDs
const pendingSet = new Set<string>();

// Store event info for always_allow decisions (need sessionId + toolName)
const pendingEvents = new Map<string, NormalizedEvent>();

export class ApprovalQueue {
  register(approvalId: string, event: NormalizedEvent, db: Database.Database): void {
    if (event.type !== 'approval_request') {
      return;
    }

    const { actionType, riskLevel, proposedAction, affectedPaths, whyRisky } = event;

    // 1. Insert into SQLite SYNCHRONOUSLY before emitting
    insertApproval(db, {
      approvalId,
      sessionId: event.sessionId,
      actionType,
      riskLevel,
      proposedAction,
      affectedPaths: affectedPaths ?? [],
      whyRisky: whyRisky ?? '',
      createdAt: event.timestamp,
    });

    // 2. Track in pending sets
    pendingSet.add(approvalId);
    pendingEvents.set(approvalId, event);

    // 3. Emit event on bus AFTER insert
    eventBus.emit('event', event);
  }

  decide(
    approvalId: string,
    decision: 'approve' | 'deny' | 'always_allow',
    db: Database.Database,
  ): void {
    // No-op if unknown
    if (!pendingSet.has(approvalId)) {
      return;
    }

    // Claim atomically
    pendingSet.delete(approvalId);
    const event = pendingEvents.get(approvalId);
    pendingEvents.delete(approvalId);

    const status =
      decision === 'approve'
        ? 'approved'
        : decision === 'deny'
          ? 'denied'
          : 'always_allow';

    // Update SQLite
    updateApprovalDecision(db, approvalId, status, 'User decision');

    // Insert always_allow rule if applicable
    if (decision === 'always_allow' && event && event.type === 'approval_request') {
      insertAlwaysAllowRule(db, {
        sessionId: event.sessionId,
        toolName: event.actionType,
        pattern: event.proposedAction,
        createdAt: new Date().toISOString(),
      });
    }

    // Emit approval_resolved event
    const resolvedEvent: NormalizedEvent = {
      schemaVersion: 1,
      sessionId: event?.sessionId ?? '',
      timestamp: new Date().toISOString(),
      type: 'approval_resolved',
      approvalId,
      decision: status,
    } as NormalizedEvent;
    eventBus.emit('event', resolvedEvent);

    // Call resolveApproval on the hook server (Claude) — no-op if not a Claude approval
    const hookDecision =
      decision === 'approve' ? 'allow' : decision === 'deny' ? 'deny' : 'allow';
    resolveApproval(approvalId, hookDecision);
    // Call resolveCodexApproval (Codex) — no-op if not a Codex approval
    resolveCodexApproval(approvalId, decision);
  }

  handleTimeout(approvalId: string, db: Database.Database): void {
    // No-op if unknown
    if (!pendingSet.has(approvalId)) {
      return;
    }

    // Claim atomically
    pendingSet.delete(approvalId);
    const event = pendingEvents.get(approvalId);
    pendingEvents.delete(approvalId);

    const reason = 'Auto-denied: timeout exceeded';

    // Update SQLite
    updateApprovalDecision(db, approvalId, 'timeout', reason);

    // Emit approval_resolved with timeout decision
    const expiredEvent: NormalizedEvent = {
      schemaVersion: 1,
      sessionId: event?.sessionId ?? '',
      timestamp: new Date().toISOString(),
      type: 'approval_resolved',
      approvalId,
      decision: 'timeout',
    } as NormalizedEvent;
    eventBus.emit('event', expiredEvent);

    // Call resolveApproval deny (Claude) — no-op if not a Claude approval
    resolveApproval(approvalId, 'deny', reason);
    // Call resolveCodexApproval deny (Codex) — no-op if not a Codex approval
    resolveCodexApproval(approvalId, 'deny');
  }
}

export const approvalQueue = new ApprovalQueue();
