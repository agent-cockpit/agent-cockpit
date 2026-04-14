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

function normalizeItemType(itemType: unknown): string {
  if (typeof itemType !== 'string') return '';
  return itemType.replace(/[\s_-]/g, '').toLowerCase();
}

function extractText(value: unknown): string | null {
  if (typeof value === 'string') {
    const text = value.trim();
    return text.length > 0 ? text : null;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => extractText(entry))
      .filter((entry): entry is string => Boolean(entry));
    if (parts.length === 0) return null;
    return parts.join('\n').trim() || null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  if (typeof record['text'] === 'string') {
    return extractText(record['text']);
  }
  if (typeof record['message'] === 'string') {
    return extractText(record['message']);
  }
  if (typeof record['content'] === 'string') {
    return extractText(record['content']);
  }
  if ('content' in record) {
    const fromContent = extractText(record['content']);
    if (fromContent) return fromContent;
  }
  if ('msg' in record) {
    const fromMsg = extractText(record['msg']);
    if (fromMsg) return fromMsg;
  }
  return null;
}

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
    case 'thread/started': {
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
      // Emit the final assistant message if the turn result carries text content.
      // Session lifecycle is still driven by process start/exit — not this event.
      const output = params['output'] ?? params['result'] ?? params['content'];
      const text = extractText(output);
      if (!text) return null;
      return {
        ...base,
        type: 'session_chat_message',
        provider: 'codex',
        role: 'assistant',
        content: text,
      };
    }

    case 'thread/resumed': {
      // A resumed thread should still surface a session_start if not already emitted
      // (e.g. daemon restarted and reconnected to an existing Codex thread).
      if (ctx.sessionStartEmitted) return null;
      ctx.sessionStartEmitted = true;
      return {
        ...base,
        type: 'session_start',
        provider: 'codex',
        workspacePath: ctx.workspacePath,
      };
    }

    case 'item/started': {
      const item = params['item'] as Record<string, unknown> | undefined;
      const itemType = normalizeItemType(item?.['type']);

      if (itemType === 'commandexecution') {
        const command = (item?.['command'] as string[] | undefined) ?? [];
        return {
          ...base,
          type: 'tool_call',
          toolName: command.join(' '),
          input: { command },
        };
      }

      if (itemType === 'filechange') {
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

    case 'item/completed': {
      const item = params['item'] as Record<string, unknown> | undefined;
      const itemType = normalizeItemType(item?.['type']);
      if (itemType === 'assistantmessage') {
        const content = extractText(item?.['content']);
        if (!content) return null;
        return {
          ...base,
          type: 'session_chat_message',
          provider: 'codex',
          role: 'assistant',
          content,
        };
      }
      return null;
    }

    case 'codex/event/agent_message': {
      const content = extractText((params['msg'] as Record<string, unknown> | undefined)?.['message']);
      if (!content) return null;
      return {
        ...base,
        type: 'session_chat_message',
        provider: 'codex',
        role: 'assistant',
        content,
      };
    }

    case 'codex/event/stream_error': {
      const content = extractText(params['msg']) ?? 'Codex stream error while waiting for assistant response.';
      return {
        ...base,
        type: 'session_chat_error',
        provider: 'codex',
        reasonCode: 'CHAT_SEND_FAILED',
        reason: content,
      };
    }

    case 'error': {
      const content = extractText(params['error']) ?? 'Codex request failed while waiting for assistant response.';
      return {
        ...base,
        type: 'session_chat_error',
        provider: 'codex',
        reasonCode: 'CHAT_SEND_FAILED',
        reason: content,
      };
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
