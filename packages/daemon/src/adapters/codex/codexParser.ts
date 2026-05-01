import { randomUUID } from 'node:crypto';
import type { NormalizedEvent } from '@agentcockpit/shared';
import { classifyCodexApproval } from './codexRiskClassifier.js';

export type CodexMessage = Record<string, unknown>;

// Context object tracks per-session state — mutated by parseCodexLine
export interface CodexParserContext {
  sessionId: string;
  workspacePath: string;
  sessionStartEmitted: boolean;
  assistantItemsWithDelta?: Set<string>;
}

// Extended event type that carries the optional Codex server request ID.
// The _codexServerId field is NOT part of the NormalizedEvent schema — it is a
// side-channel value used by the adapter to correlate approval replies.
type CodexNormalizedEvent = NormalizedEvent & { _codexServerId?: unknown };

function normalizeItemType(itemType: unknown): string {
  if (typeof itemType !== 'string') return '';
  return itemType.replace(/[\s_-]/g, '').toLowerCase();
}

function toCommandTokens(command: unknown): string[] {
  if (Array.isArray(command)) {
    return command.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }
  if (typeof command === 'string') {
    return command
      .trim()
      .split(/\s+/)
      .filter((entry) => entry.length > 0);
  }
  return [];
}

function toCommandText(command: unknown): string {
  const tokens = toCommandTokens(command);
  if (tokens.length > 0) return tokens.join(' ');
  return typeof command === 'string' ? command.trim() : '';
}

function extractFileChangePaths(item: Record<string, unknown> | undefined): string[] {
  const directPath = typeof item?.['path'] === 'string' ? [item['path']] : [];
  const changes = Array.isArray(item?.['changes'])
    ? (item['changes'] as Array<Record<string, unknown>>)
        .map((change) => change?.['path'])
        .filter((path): path is string => typeof path === 'string' && path.length > 0)
    : [];
  return [...new Set([...directPath, ...changes])];
}

function stringId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function extractCorrelationIdFromParams(params: Record<string, unknown>, fallback: unknown): string | undefined {
  const item = params['item'] && typeof params['item'] === 'object'
    ? (params['item'] as Record<string, unknown>)
    : undefined;
  return stringId(item?.['id']) ?? stringId(params['itemId']) ?? stringId(params['callId']) ?? stringId(fallback);
}

function extractToolName(item: Record<string, unknown> | undefined): string | undefined {
  return stringId(item?.['toolName']) ?? stringId(item?.['tool_name']) ?? stringId(item?.['name'])
}

function extractToolInput(item: Record<string, unknown> | undefined): unknown {
  return item?.['input'] ?? item?.['toolInput'] ?? item?.['tool_input'] ?? {}
}

function extractTaskUpdate(params: Record<string, unknown>): { status?: string; summary?: string; taskTitle?: string } | null {
  const task = params['task'] && typeof params['task'] === 'object'
    ? (params['task'] as Record<string, unknown>)
    : undefined
  const plan = params['plan'] && typeof params['plan'] === 'object'
    ? (params['plan'] as Record<string, unknown>)
    : undefined
  const status = stringId(task?.['status']) ?? stringId(plan?.['status']) ?? stringId(params['status'])
  const taskTitle = stringId(task?.['title']) ?? stringId(params['taskTitle'])
  const summary =
    extractText(task?.['summary']) ??
    extractText(plan?.['summary']) ??
    extractText(params['summary']) ??
    extractText(params['message'])
  if (!status && !summary && !taskTitle) return null
  return {
    ...(status ? { status } : {}),
    ...(summary ? { summary } : {}),
    ...(taskTitle ? { taskTitle } : {}),
  }
}

function getAssistantDeltaSet(ctx: CodexParserContext): Set<string> {
  if (!ctx.assistantItemsWithDelta) {
    ctx.assistantItemsWithDelta = new Set<string>();
  }
  return ctx.assistantItemsWithDelta;
}

function toNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0) return null;
  return Math.round(value);
}

type TokenUsageBreakdown = {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
};

function parseTokenUsageBreakdown(value: unknown): TokenUsageBreakdown | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const totalTokens = toNonNegativeInteger(record['totalTokens']);
  const inputTokens = toNonNegativeInteger(record['inputTokens']);
  const cachedInputTokens = toNonNegativeInteger(record['cachedInputTokens']);
  const outputTokens = toNonNegativeInteger(record['outputTokens']);
  const reasoningOutputTokens = toNonNegativeInteger(record['reasoningOutputTokens']);
  if (
    totalTokens === null ||
    inputTokens === null ||
    cachedInputTokens === null ||
    outputTokens === null ||
    reasoningOutputTokens === null
  ) {
    return null;
  }
  return {
    totalTokens,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
  };
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

function extractTextForDelta(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.length > 0 ? value : null;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => extractTextForDelta(entry))
      .filter((entry): entry is string => entry !== null);
    if (parts.length === 0) return null;
    return parts.join('');
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  if (typeof record['text'] === 'string') {
    return extractTextForDelta(record['text']);
  }
  if (typeof record['message'] === 'string') {
    return extractTextForDelta(record['message']);
  }
  if (typeof record['content'] === 'string') {
    return extractTextForDelta(record['content']);
  }
  if ('content' in record) {
    const fromContent = extractTextForDelta(record['content']);
    if (fromContent !== null) return fromContent;
  }
  if ('msg' in record) {
    const fromMsg = extractTextForDelta(record['msg']);
    if (fromMsg !== null) return fromMsg;
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
      getAssistantDeltaSet(ctx).clear();
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

    case 'thread/tokenUsage/updated': {
      const tokenUsage =
        params['tokenUsage'] && typeof params['tokenUsage'] === 'object'
          ? (params['tokenUsage'] as Record<string, unknown>)
          : null;
      if (!tokenUsage) return null;

      const totalBreakdown = parseTokenUsageBreakdown(tokenUsage['total']);
      const lastBreakdown = parseTokenUsageBreakdown(tokenUsage['last']);
      if (!totalBreakdown || !lastBreakdown) return null;

      const contextWindowTokens = toNonNegativeInteger(tokenUsage['modelContextWindow']);
      const contextUsedTokens = lastBreakdown.inputTokens;
      const contextPercent =
        contextWindowTokens && contextWindowTokens > 0
          ? Math.max(0, Math.min(100, Math.round((contextUsedTokens / contextWindowTokens) * 100)))
          : undefined;

      return {
        ...base,
        type: 'session_usage',
        provider: 'codex',
        inputTokens: totalBreakdown.inputTokens,
        outputTokens: totalBreakdown.outputTokens,
        totalTokens: totalBreakdown.totalTokens,
        cachedInputTokens: totalBreakdown.cachedInputTokens,
        reasoningOutputTokens: totalBreakdown.reasoningOutputTokens,
        contextUsedTokens,
        ...(contextWindowTokens ? { contextWindowTokens } : {}),
        ...(contextPercent !== undefined ? { contextPercent } : {}),
      };
    }

    case 'item/started': {
      const item = params['item'] as Record<string, unknown> | undefined;
      const itemType = normalizeItemType(item?.['type']);

      if (itemType === 'commandexecution') {
        const command = toCommandText(item?.['command']) || 'commandExecution';
        const correlationId = typeof item?.['id'] === 'string' ? item['id'] : undefined;
        return {
          ...base,
          type: 'command_started',
          command,
          ...(typeof item?.['cwd'] === 'string' ? { cwd: item['cwd'] } : {}),
          ...(correlationId ? { correlationId } : {}),
        };
      }

      if (itemType === 'filechange') {
        const paths = extractFileChangePaths(item);
        const filePath = paths[0] ?? '';
        const changeType = (item?.['changeType'] as 'created' | 'modified' | 'deleted' | undefined) ?? 'modified';
        const correlationId = stringId(item?.['id']);
        return {
          ...base,
          type: 'file_change',
          filePath,
          changeType,
          ...(correlationId ? { correlationId } : {}),
        };
      }

      const toolName = extractToolName(item);
      if (toolName) {
        const correlationId = stringId(item?.['id']);
        return {
          ...base,
          type: 'tool_called',
          toolName,
          input: extractToolInput(item),
          ...(correlationId ? { correlationId } : {}),
        };
      }

      // Unknown item type — no event
      return null;
    }

    case 'item/completed': {
      const item = params['item'] as Record<string, unknown> | undefined;
      const itemType = normalizeItemType(item?.['type']);
      if (itemType === 'assistantmessage' || itemType === 'agentmessage') {
        const itemId = typeof item?.['id'] === 'string' ? item['id'] : null;
        if (itemId && getAssistantDeltaSet(ctx).has(itemId)) {
          return null;
        }
        const content = extractText(item?.['content']) ?? extractText(item?.['text']);
        if (!content) return null;
        return {
          ...base,
          type: 'session_chat_message',
          provider: 'codex',
          role: 'assistant',
          content,
        };
      }
      if (itemType === 'commandexecution') {
        const command = toCommandText(item?.['command']) || 'commandExecution';
        const correlationId = typeof item?.['id'] === 'string' ? item['id'] : undefined;
        const exitCode =
          typeof item?.['exitCode'] === 'number'
            ? item['exitCode']
            : typeof item?.['exit_code'] === 'number'
              ? item['exit_code']
              : undefined;
        const output = extractText(item?.['output']) ?? extractText(item?.['stdout']);
        const errorOutput = extractText(item?.['error']) ?? extractText(item?.['stderr']);
        return {
          ...base,
          type: 'command_completed',
          command,
          ...(exitCode !== undefined ? { exitCode } : {}),
          ...(output ? { stdoutExcerpt: output.slice(0, 2000) } : {}),
          ...(errorOutput ? { stderrExcerpt: errorOutput.slice(0, 2000) } : {}),
          ...(correlationId ? { correlationId } : {}),
        };
      }
      const toolName = extractToolName(item);
      if (toolName) {
        const correlationId = stringId(item?.['id']);
        return {
          ...base,
          type: 'tool_completed',
          toolName,
          output: item?.['output'] ?? item?.['result'] ?? item?.['content'],
          ...(typeof item?.['success'] === 'boolean' ? { success: item['success'] } : {}),
          ...(correlationId ? { correlationId } : {}),
        };
      }
      return null;
    }

    case 'task/updated':
    case 'plan/updated':
    case 'codex/event/task_update': {
      const update = extractTaskUpdate(params);
      if (!update) return null;
      return {
        ...base,
        type: 'task_updated',
        ...update,
      };
    }

    case 'item/agentMessage/delta': {
      const delta = extractTextForDelta(params['delta']);
      if (!delta) return null;
      const itemId = typeof params['itemId'] === 'string' ? params['itemId'] : null;
      if (itemId) getAssistantDeltaSet(ctx).add(itemId);
      return {
        ...base,
        type: 'session_chat_message',
        provider: 'codex',
        role: 'assistant',
        content: delta,
      };
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
    case 'item/fileChange/requestApproval':
    case 'item/permissions/requestApproval':
    case 'applyPatchApproval':
    case 'execCommandApproval': {
      const codexServerId = msg['id'];
      const classification = classifyCodexApproval(method, params);
      const correlationId = extractCorrelationIdFromParams(params, codexServerId);

      const event: CodexNormalizedEvent = {
        ...base,
        type: 'approval_request',
        approvalId: randomUUID(),
        actionType: classification.actionType,
        riskLevel: classification.riskLevel,
        proposedAction: classification.proposedAction,
        affectedPaths: classification.affectedPaths,
        whyRisky: classification.whyRisky,
        ...(correlationId ? { correlationId } : {}),
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
