import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NormalizedEvent } from '@cockpit/shared';
import { parseHookPayload, type HookPayload } from './hookParser.js';

const APPROVAL_TIMEOUT_MS = parseInt(
  process.env['COCKPIT_APPROVAL_TIMEOUT_MS'] ?? '60000',
  10,
);
const EXTERNAL_SESSION_REASON = 'External session is approval-only; chat send is disabled.';

interface PendingApproval {
  res: ServerResponse;
  timer: ReturnType<typeof setTimeout>;
  hookEventName: string;
}

// Module-level map of pending approvals (approvalId → state)
const pendingApprovals = new Map<string, PendingApproval>();

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

export function resolveApproval(
  approvalId: string,
  decision: 'allow' | 'deny' | 'always_allow',
  reason?: string,
): void {
  const pending = pendingApprovals.get(approvalId);
  if (!pending) {
    // No-op: approval already resolved or timed out
    return;
  }

  // Claim: delete first to prevent double-resolution
  pendingApprovals.delete(approvalId);
  clearTimeout(pending.timer);

  const { res, hookEventName } = pending;

  if (res.writableEnded) {
    return;
  }

  const effectiveDecision = decision === 'always_allow' ? 'allow' : decision;

  let body: string;
  if (hookEventName === 'PermissionRequest') {
    body = buildPermissionRequestEnvelope(effectiveDecision);
  } else {
    // PreToolUse
    body = buildPreToolUseEnvelope(effectiveDecision, reason);
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(body);
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
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request: invalid JSON' }));
      return;
    }

    let parsed: { event: NormalizedEvent; requiresApproval: boolean };
    try {
      parsed = parseHookPayload(payload);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request: failed to parse hook payload' }));
      return;
    }

    const { event, requiresApproval } = parsed;

    // Guarantee every session has a session_start with workspace before any other event.
    // Claude's SessionStart hook fires without cwd, or often doesn't fire at all — so we
    // use the first PreToolUse/PostToolUse/etc. event (which always carries cwd) as the trigger.
    if (event.type === 'session_start') {
      // Real session_start: track it only when workspace is populated so a later tool event
      // with cwd can still emit a corrected session_start if this one had empty workspace.
      if (payload.cwd) {
        startedSessions.add(event.sessionId);
      }
    } else if (!startedSessions.has(event.sessionId)) {
      startedSessions.add(event.sessionId);
      const managedByDaemon = payload.session_id === event.sessionId
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
        ...(managedByDaemon ? {} : { reason: EXTERNAL_SESSION_REASON }),
      } as NormalizedEvent);
    }

    if (requiresApproval && event.type === 'approval_request') {
      const { approvalId } = event;

      // Set up timeout
      const timer = setTimeout(() => {
        // Delete first (claim)
        pendingApprovals.delete(approvalId);

        if (!res.writableEnded) {
          // Deny on timeout
          const body =
            payload.hook_event_name === 'PermissionRequest'
              ? buildPermissionRequestEnvelope('deny')
              : buildPreToolUseEnvelope('deny', 'approval timeout');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(body);
        }
        // Notify approval queue so it can persist the timeout and emit approval_resolved
        onApprovalTimeout(approvalId);
      }, APPROVAL_TIMEOUT_MS);

      pendingApprovals.set(approvalId, {
        res,
        timer,
        hookEventName: payload.hook_event_name,
      });

      // Notify caller — do NOT close res
      onDecisionNeeded(approvalId, event);
      // Response intentionally left open
    } else {
      onEvent(event);
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

  server.listen(port);
  return server;
}
