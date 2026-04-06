import { randomUUID } from 'node:crypto';
import type { NormalizedEvent } from '@cockpit/shared';
import { classifyCodexApproval } from './codexRiskClassifier.js';

export type CodexMessage = Record<string, unknown>;

// Context object tracks per-session state — mutated by parseCodexLine
export interface CodexParserContext {
  sessionId: string;
  workspacePath: string;
  sessionStartEmitted: boolean;
}

// Extended event type that carries the optional Codex server request ID.
// The _codexServerId field is NOT part of the NormalizedEvent schema — it is a
// side-channel value used by the adapter to correlate approval replies.
type CodexNormalizedEvent = NormalizedEvent & { _codexServerId?: unknown };

/**
 * Parse a single JSONL line emitted by the Codex app-server.
 * Returns a NormalizedEvent to emit, or null if this line produces no event.
 * Never throws — malformed JSON is returned as a provider_parse_error event.
 */
export function parseCodexLine(
  line: string,
  ctx: CodexParserContext,
): CodexNormalizedEvent | null {
  const base = {
    schemaVersion: 1 as const,
    sessionId: ctx.sessionId,
    timestamp: new Date().toISOString(),
  };

  // Parse the JSONL line — on error return provider_parse_error
  let msg: CodexMessage;
  try {
    msg = JSON.parse(line) as CodexMessage;
  } catch (err) {
    return {
      ...base,
      type: 'provider_parse_error',
      provider: 'codex',
      rawPayload: line,
      errorMessage: String(err),
    };
  }

  const method = msg['method'] as string | undefined;
  const params = (msg['params'] as Record<string, unknown>) ?? {};

  switch (method) {
    case 'turn/started': {
      if (ctx.sessionStartEmitted) {
        return null;
      }
      ctx.sessionStartEmitted = true;
      return {
        ...base,
        type: 'session_start',
        provider: 'codex',
        workspacePath: ctx.workspacePath,
      };
    }

    case 'turn/completed': {
      const turn = params['turn'] as Record<string, unknown> | undefined;
      const status = turn?.['status'] as string | undefined;
      const exitCode = status === 'failed' ? 1 : 0;
      return {
        ...base,
        type: 'session_end',
        provider: 'codex',
        exitCode,
      };
    }

    case 'item/started': {
      const item = params['item'] as Record<string, unknown> | undefined;
      const itemType = item?.['type'] as string | undefined;

      if (itemType === 'commandExecution') {
        const command = (item?.['command'] as string[] | undefined) ?? [];
        return {
          ...base,
          type: 'tool_call',
          toolName: command.join(' '),
          input: { command },
        };
      }

      if (itemType === 'fileChange') {
        const filePath = (item?.['path'] as string | undefined) ?? '';
        const changeType = (item?.['changeType'] as 'created' | 'modified' | 'deleted' | undefined) ?? 'modified';
        return {
          ...base,
          type: 'file_change',
          filePath,
          changeType,
        };
      }

      // Unknown item type — no event
      return null;
    }

    case 'item/commandExecution/requestApproval':
    case 'item/fileChange/requestApproval': {
      const codexServerId = msg['id'];
      const classification = classifyCodexApproval(method, params);

      const event: CodexNormalizedEvent = {
        ...base,
        type: 'approval_request',
        approvalId: randomUUID(),
        actionType: classification.actionType,
        riskLevel: classification.riskLevel,
        proposedAction: classification.proposedAction,
        affectedPaths: classification.affectedPaths,
        whyRisky: classification.whyRisky,
        _codexServerId: codexServerId,
      };
      return event;
    }

    default: {
      // Unknown method — not an error, just no event to emit
      return null;
    }
  }
}
