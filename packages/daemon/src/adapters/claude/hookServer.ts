import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NormalizedEvent } from '@agentcockpit/shared';
import { parseHookPayload, type HookPayload } from './hookParser.js';
import { logger } from '../../logger.js';

const APPROVAL_TIMEOUT_MS = parseInt(
  process.env['COCKPIT_APPROVAL_TIMEOUT_MS'] ?? '60000',
  10,
);
const EXTERNAL_SESSION_REASON = 'External session is approval-only; chat send and terminate are disabled.';

interface PendingApproval {
  responses: Set<ServerResponse>;
  timer: ReturnType<typeof setTimeout>;
  hookEventName: string;
  dedupeKey: string;
  sessionId: string;
}

// Module-level map of pending approvals (approvalId → state)
const pendingApprovals = new Map<string, PendingApproval>();
// Dedupe map for repeated provider hooks about the same approval operation.
const approvalIdByDedupeKey = new Map<string, string>();

// Sessions for which we've emitted a session_start with non-empty workspace.
// Pre-populated from DB on startup so daemon restarts don't re-emit for existing sessions.
const startedSessions = new Set<string>();

/**
 * Prime the set from DB on daemon startup.
 * Called by index.ts after openDatabase() with all session IDs that already
 * have a session_start event with a non-empty workspacePath.
 */
export function initStartedSessions(sessionIds: string[]): void {
  for (const id of sessionIds) startedSessions.add(id);
}

export function markSessionStarted(sessionId: string): void {
  startedSessions.add(sessionId);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
}

function buildApprovalDedupeKey(payload: HookPayload, event: NormalizedEvent): string {
  const elicitationId = typeof payload.elicitation_id === 'string' ? payload.elicitation_id.trim() : '';
  if (elicitationId.length > 0) {
    return `${event.sessionId}|${payload.hook_event_name}|${elicitationId}`;
  }
  const toolUseId = typeof payload.tool_use_id === 'string' ? payload.tool_use_id.trim() : '';
  if (toolUseId.length > 0) {
    // Treat PreToolUse + PermissionRequest as the same approval operation when tool_use_id matches.
    return `${event.sessionId}|tool_use|${toolUseId}`;
  }
  const toolName = payload.tool_name ?? 'Unknown';
  if (payload.hook_event_name === 'PreToolUse' || payload.hook_event_name === 'PermissionRequest') {
    return `${event.sessionId}|approval_tool|${toolName}|${stableStringify(payload.tool_input ?? {})}`;
  }
  return `${event.sessionId}|${payload.hook_event_name}|${toolName}|${stableStringify(payload.tool_input ?? {})}`;
}

function buildPreToolUseEnvelope(decision: 'allow' | 'deny', reason?: string): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      ...(reason !== undefined ? { permissionDecisionReason: reason } : {}),
    },
  });
}

function buildPermissionRequestEnvelope(decision: 'allow' | 'deny'): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: decision },
    },
  });
}

function buildElicitationEnvelope(decision: 'allow' | 'deny'): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'Elicitation',
      action: decision === 'allow' ? 'accept' : 'decline',
      content: {},
    },
  });
}

export function resolveApproval(
  approvalId: string,
  decision: 'allow' | 'deny' | 'always_allow',
  reason?: string,
): void {
  const pending = pendingApprovals.get(approvalId);
  if (!pending) {
    logger.debug('hook', 'resolveApproval: no-op (already resolved or timed out)', { approvalId, decision });
    return;
  }

  // Claim: delete first to prevent double-resolution
  pendingApprovals.delete(approvalId);
  approvalIdByDedupeKey.delete(pending.dedupeKey);
  clearTimeout(pending.timer);

  const { hookEventName } = pending;

  const effectiveDecision = decision === 'always_allow' ? 'allow' : decision;

  logger.info('hook', 'Approval resolved', {
    approvalId,
    decision,
    effectiveDecision,
    hookEventName,
    responseCount: pending.responses.size,
  });

  let body: string;
  if (hookEventName === 'PermissionRequest') {
    body = buildPermissionRequestEnvelope(effectiveDecision);
  } else if (hookEventName === 'Elicitation') {
    body = buildElicitationEnvelope(effectiveDecision);
  } else {
    body = buildPreToolUseEnvelope(effectiveDecision, reason);
  }

  for (const res of pending.responses) {
    if (res.writableEnded) continue;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
  }
}

function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  onEvent: (event: NormalizedEvent) => void,
  onDecisionNeeded: (approvalId: string, event: NormalizedEvent) => void,
  onApprovalTimeout: (approvalId: string) => void,
): void {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  let rawBody = '';
  req.on('data', (chunk: Buffer) => {
    rawBody += chunk.toString();
  });

  req.on('end', () => {
    let payload: HookPayload;
    try {
      payload = JSON.parse(rawBody) as HookPayload;
    } catch {
      logger.warn('hook', 'Bad request: invalid JSON', { bodyPreview: rawBody.slice(0, 200) });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request: invalid JSON' }));
      return;
    }

    logger.debug('hook', 'Received hook payload', {
      hook_event_name: payload.hook_event_name,
      session_id: payload.session_id,
      tool_name: payload.tool_name,
      cwd: payload.cwd,
    });

    let parsed: { event: NormalizedEvent; requiresApproval: boolean };
    try {
      parsed = parseHookPayload(payload);
    } catch (err) {
      logger.error('hook', 'Failed to parse hook payload', {
        hook_event_name: payload.hook_event_name,
        session_id: payload.session_id,
        error: String(err),
      });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request: failed to parse hook payload' }));
      return;
    }

    const { event, requiresApproval } = parsed;
    let suppressEvent = false;

    logger.info('hook', `Event parsed: ${event.type}`, {
      sessionId: event.sessionId,
      hook_event_name: payload.hook_event_name,
      requiresApproval,
    });

    // Guarantee every session has a session_start with workspace before any other event.
    // Claude's SessionStart hook fires without cwd, or often doesn't fire at all — so we
    // use the first PreToolUse/PostToolUse/etc. event (which always carries cwd) as the trigger.
    if (event.type === 'session_start') {
      // Real session_start: track it only when workspace is populated so a later tool event
      // with cwd can still emit a corrected session_start if this one had empty workspace.
      if (payload.cwd) {
        if (startedSessions.has(event.sessionId)) {
          suppressEvent = true;
          logger.debug('hook', 'Duplicate session_start ignored', {
            sessionId: event.sessionId,
            cwd: payload.cwd,
            claude_session_id: payload.session_id,
          });
        } else {
          startedSessions.add(event.sessionId);
          logger.info('hook', 'Session started (SessionStart hook)', {
            sessionId: event.sessionId,
            cwd: payload.cwd,
            claude_session_id: payload.session_id,
          });
        }
      } else if (startedSessions.has(event.sessionId)) {
        suppressEvent = true;
        logger.debug('hook', 'Duplicate session_start without cwd ignored', {
          sessionId: event.sessionId,
          claude_session_id: payload.session_id,
        });
      } else {
        startedSessions.add(event.sessionId);
        logger.debug('hook', 'SessionStart received without cwd — deferring start tracking', {
          sessionId: event.sessionId,
          claude_session_id: payload.session_id,
        });
      }
    } else if (!startedSessions.has(event.sessionId)) {
      startedSessions.add(event.sessionId);
      const managedByDaemon = payload.session_id === event.sessionId
      logger.info('hook', 'Synthetic session_start emitted (first tool event for unseen session)', {
        sessionId: event.sessionId,
        claude_session_id: payload.session_id,
        managedByDaemon,
        cwd: payload.cwd,
        trigger_event: event.type,
      });
      onEvent({
        schemaVersion: 1,
        sessionId: event.sessionId,
        type: 'session_start',
        provider: 'claude',
        timestamp: event.timestamp,
        workspacePath: payload.cwd ?? '',
        managedByDaemon,
        canSendMessage: managedByDaemon,
        canTerminateSession: managedByDaemon,
        ...(managedByDaemon ? { mode: 'pty' as const } : {}),
        ...(managedByDaemon ? {} : { reason: EXTERNAL_SESSION_REASON }),
      } as NormalizedEvent);
    }

    if (
      payload.hook_event_name === 'PreToolUse' &&
      event.type === 'tool_call' &&
      payload.tool_input &&
      typeof payload.tool_input === 'object' &&
      (payload.tool_input as Record<string, unknown>)['dangerouslyDisableSandbox'] === true
    ) {
      logger.warn('hook', 'PreToolUse reported dangerouslyDisableSandbox=true without PermissionRequest', {
        sessionId: event.sessionId,
        tool_name: payload.tool_name ?? 'Unknown',
        tool_use_id: payload.tool_use_id,
      });
    }

    if (requiresApproval && event.type === 'approval_request') {
      const { approvalId } = event;
      const dedupeKey = buildApprovalDedupeKey(payload, event);

      const existingApprovalId = approvalIdByDedupeKey.get(dedupeKey);
      if (existingApprovalId) {
        const existingPending = pendingApprovals.get(existingApprovalId);
        if (existingPending) {
          existingPending.responses.add(res);
          logger.info('hook', 'Duplicate approval request deduped', {
            approvalId: existingApprovalId,
            sessionId: event.sessionId,
            hook_event_name: payload.hook_event_name,
            dedupeKey,
            responseCount: existingPending.responses.size,
          });
          return;
        }
        // Stale key safety (shouldn't happen): clear and proceed as new approval.
        approvalIdByDedupeKey.delete(dedupeKey);
      }

      logger.info('hook', 'Approval request pending', {
        approvalId,
        sessionId: event.sessionId,
        actionType: event.actionType,
        riskLevel: event.riskLevel,
        hook_event_name: payload.hook_event_name,
        timeoutMs: APPROVAL_TIMEOUT_MS,
        dedupeKey,
      });

      // Set up timeout
      const timer = setTimeout(() => {
        const pending = pendingApprovals.get(approvalId);
        if (!pending) return;
        // Delete first (claim)
        pendingApprovals.delete(approvalId);
        approvalIdByDedupeKey.delete(pending.dedupeKey);

        logger.warn('hook', 'Approval timed out — denying', {
          approvalId,
          sessionId: event.sessionId,
          timeoutMs: APPROVAL_TIMEOUT_MS,
        });

        for (const pendingRes of pending.responses) {
          if (pendingRes.writableEnded) continue;
          // Deny on timeout
          const body =
            pending.hookEventName === 'PermissionRequest'
              ? buildPermissionRequestEnvelope('deny')
              : pending.hookEventName === 'Elicitation'
                ? buildElicitationEnvelope('deny')
              : buildPreToolUseEnvelope('deny', 'approval timeout');
          pendingRes.writeHead(200, { 'Content-Type': 'application/json' });
          pendingRes.end(body);
        }
        // Notify approval queue so it can persist the timeout and emit approval_resolved
        onApprovalTimeout(approvalId);
      }, APPROVAL_TIMEOUT_MS);

      pendingApprovals.set(approvalId, {
        responses: new Set([res]),
        timer,
        hookEventName: payload.hook_event_name,
        dedupeKey,
        sessionId: event.sessionId,
      });
      approvalIdByDedupeKey.set(dedupeKey, approvalId);

      // Notify caller — do NOT close res
      onDecisionNeeded(approvalId, event);
      // Response intentionally left open
    } else {
      if (!suppressEvent) {
        onEvent(event);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({}));
    }
  });
}

export function createHookServer(
  port: number,
  onEvent: (event: NormalizedEvent) => void,
  onDecisionNeeded: (approvalId: string, event: NormalizedEvent) => void,
  onApprovalTimeout: (approvalId: string) => void = () => {},
): http.Server {
  const server = http.createServer((req, res) => {
    handleRequest(req, res, onEvent, onDecisionNeeded, onApprovalTimeout);
  });

  const host = process.env['COCKPIT_HOOK_HOST'] ?? '127.0.0.1';
  server.listen(port, host);
  return server;
}
