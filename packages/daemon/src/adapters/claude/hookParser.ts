import { randomUUID } from 'node:crypto';
import type { NormalizedEvent } from '@agentcockpit/shared';
import type Database from 'better-sqlite3';
import { classifyRisk } from './riskClassifier.js';
import { getClaudeSessionId, setClaudeSessionId } from '../../db/queries.js';

export type HookPayload = {
  session_id: string;
  hook_event_name: string;
  cwd?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: Record<string, unknown>;
  permission_suggestions?: Array<Record<string, unknown>>;
  message?: string;
  content?: string;
  notification_type?: string;
  agent_id?: string;
  mcp_server_name?: string;
  mode?: string;
  url?: string;
  elicitation_id?: string;
  requested_schema?: Record<string, unknown>;
  transcript_path?: string;
  permission_mode?: string;
  // Stop hook fields
  stop_hook_active?: boolean;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  
};

// Tools auto-approved without user review. Everything NOT in this set triggers an
// approval_request that the daemon holds open until the user approves or denies.
// Must match the --allowedTools list passed to Claude in claudeLauncher.ts.
export const COCKPIT_ALLOWED_TOOLS: ReadonlySet<string> = new Set([
  'Read',
  'Glob',
  'Grep',
  'Write',
  'Edit',
  'MultiEdit',
  'Agent',
  'AskUserQuestion',
]);

// Module-level session ID cache: Claude session_id → UUID
// Replaced by DB-backed three-tier lookup; initialized at daemon startup
let claudeSessionCache = new Map<string, string>();

// Module-level DB reference — set by daemon entrypoint at startup
let claudeSessionDb: Database.Database | null = null;

const EXTERNAL_SESSION_REASON = 'External session is approval-only; chat send and terminate are disabled.';

/** Called by daemon entrypoint to inject the pre-populated cache from claude_sessions table. */
export function setClaudeSessionCache(newCache: Map<string, string>): void {
  claudeSessionCache = newCache;
}

/** Called by daemon entrypoint to inject the DB instance for three-tier lookup. */
export function setClaudeSessionDb(db: Database.Database | null): void {
  claudeSessionDb = db;
}

/**
 * Three-tier session ID lookup:
 *   Tier 1 — in-memory cache (fast path, avoids DB round-trip)
 *   Tier 2 — DB lookup (survives daemon restart when cache is cold)
 *   Tier 3 — create new UUID and persist mapping
 */
export function getOrCreateSessionId(
  claudeSessionId: string,
  workspace: string = '',
  db: Database.Database | null = claudeSessionDb,
  cache: Map<string, string> = claudeSessionCache,
): string {
  // Tier 1: fast cache lookup
  const cached = cache.get(claudeSessionId);
  if (cached) {
    return cached;
  }

  // Tier 2: DB lookup — recover mapping after restart
  if (db) {
    const existing = getClaudeSessionId(db, claudeSessionId);
    if (existing) {
      cache.set(claudeSessionId, existing);
      return existing;
    }
  }

  // Tier 3: create new UUID and persist
  const uuid = randomUUID();
  if (db) {
    setClaudeSessionId(db, uuid, claudeSessionId, workspace);
  }
  cache.set(claudeSessionId, uuid);
  return uuid;
}

function baseFields(payload: HookPayload): {
  schemaVersion: 1;
  sessionId: string;
  timestamp: string;
  provider: 'claude';
} {
  return {
    schemaVersion: 1,
    sessionId: getOrCreateSessionId(payload.session_id, payload.cwd ?? ''),
    timestamp: new Date().toISOString(),
    provider: 'claude',
  };
}

function resolveSessionCapabilities(claudeSessionId: string, mappedSessionId: string): {
  managedByDaemon: boolean
  canSendMessage: boolean
  canTerminateSession: boolean
  reason?: string
} {
  const managedByDaemon = claudeSessionId === mappedSessionId
  if (managedByDaemon) {
    return {
      managedByDaemon: true,
      canSendMessage: true,
      canTerminateSession: true,
    }
  }
  return {
    managedByDaemon: false,
    canSendMessage: false,
    canTerminateSession: false,
    reason: EXTERNAL_SESSION_REASON,
  }
}

function extractChatText(value: unknown): string | null {
  if (typeof value === 'string') {
    const text = value.trim();
    return text.length > 0 ? text : null;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => extractChatText(entry))
      .filter((entry): entry is string => Boolean(entry));
    if (parts.length === 0) return null;
    return parts.join('\n').trim() || null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  if (typeof record['text'] === 'string') return extractChatText(record['text']);
  if (typeof record['message'] === 'string') return extractChatText(record['message']);
  if (typeof record['content'] === 'string') return extractChatText(record['content']);

  if ('content' in record) {
    const fromContent = extractChatText(record['content']);
    if (fromContent) return fromContent;
  }
  if ('tool_input' in record) {
    const fromToolInput = extractChatText(record['tool_input']);
    if (fromToolInput) return fromToolInput;
  }
  return null;
}

// Per-session cumulative token counters for PTY Stop hook.
const tokenAccumulator = new Map<string, { input: number; output: number; cached: number }>();

function buildSyntheticDiff(
  toolName: string,
  toolInput: Record<string, unknown>,
  filePath: string,
): string | undefined {
  if (toolName === 'Write') {
    const content = typeof toolInput['content'] === 'string' ? toolInput['content'] : null;
    if (!content) return undefined;
    const lines = content.split('\n').slice(0, 300);
    return [`--- /dev/null`, `+++ b/${filePath}`, '@@', ...lines.map((l) => `+${l}`)].join('\n');
  }
  if (toolName === 'Edit' || toolName === 'Update') {
    const old = typeof toolInput['old_string'] === 'string' ? toolInput['old_string'] : null;
    const nw = typeof toolInput['new_string'] === 'string' ? toolInput['new_string'] : null;
    if (old === null || nw === null) return undefined;
    return [
      `--- a/${filePath}`, `+++ b/${filePath}`, '@@',
      ...old.split('\n').map((l) => `-${l}`),
      ...nw.split('\n').map((l) => `+${l}`),
    ].join('\n');
  }
  if (toolName === 'MultiEdit') {
    const edits = Array.isArray(toolInput['edits']) ? toolInput['edits'] : null;
    if (!edits || edits.length === 0) return undefined;
    const parts: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];
    for (const edit of edits) {
      if (!edit || typeof edit !== 'object') continue;
      const e = edit as Record<string, unknown>;
      const old = typeof e['old_string'] === 'string' ? e['old_string'] : null;
      const nw = typeof e['new_string'] === 'string' ? e['new_string'] : null;
      if (old !== null && nw !== null) {
        parts.push('@@');
        parts.push(...old.split('\n').map((l) => `-${l}`));
        parts.push(...nw.split('\n').map((l) => `+${l}`));
      }
    }
    return parts.join('\n');
  }
  return undefined;
}

function getFileChangeDetails(
  toolName: string,
  toolInput: Record<string, unknown>,
): { filePath: string; changeType: 'created' | 'modified' | 'deleted'; diff?: string } | null {
  if (toolName !== 'Write' && toolName !== 'Edit' && toolName !== 'Update' && toolName !== 'MultiEdit') {
    return null
  }

  const filePath =
    typeof toolInput['path'] === 'string'
      ? toolInput['path']
      : typeof toolInput['file_path'] === 'string'
        ? toolInput['file_path']
        : null
  if (!filePath) return null

  const changeType: 'created' | 'modified' = toolName === 'Write' ? 'created' : 'modified';
  const diff = buildSyntheticDiff(toolName, toolInput, filePath);

  return { filePath, changeType, diff }
}

export function parseHookPayload(payload: HookPayload): {
  event: NormalizedEvent;
  requiresApproval: boolean;
} {
  const base = baseFields(payload);

  switch (payload.hook_event_name) {
    case 'SessionStart': {
      const capabilities = resolveSessionCapabilities(payload.session_id, base.sessionId)
      return {
        event: {
          ...base,
          type: 'session_start',
          workspacePath: payload.cwd ?? '',
          ...capabilities,
        },
        requiresApproval: false,
      };
    }

    case 'SessionEnd': {
      return {
        event: {
          ...base,
          type: 'session_end',
        },
        requiresApproval: false,
      };
    }

    case 'PreToolUse': {
      const toolName = payload.tool_name ?? 'Unknown';
      const toolInput = payload.tool_input ?? {};

      if (!COCKPIT_ALLOWED_TOOLS.has(toolName)) {
        const classification = classifyRisk(toolName, toolInput);
        return {
          event: {
            ...base,
            type: 'approval_request',
            approvalId: payload.tool_use_id ?? randomUUID(),
            actionType: classification.actionType,
            riskLevel: classification.riskLevel,
            proposedAction: `${toolName}: ${JSON.stringify(toolInput)}`,
            affectedPaths: [],
            whyRisky: classification.whyRisky,
          },
          requiresApproval: true,
        };
      }

      return {
        event: {
          ...base,
          type: 'tool_call',
          toolName,
          input: toolInput,
        },
        requiresApproval: false,
      };
    }

    case 'PostToolUse': {
      const toolName = payload.tool_name ?? 'Unknown'
      const toolInput = payload.tool_input ?? {}
      const fileChange = getFileChangeDetails(toolName, toolInput)
      if (fileChange) {
        return {
          event: {
            ...base,
            type: 'file_change',
            ...fileChange,
          },
          requiresApproval: false,
        };
      }

      return {
        event: {
          ...base,
          type: 'tool_call',
          toolName,
          input: toolInput,
        },
        requiresApproval: false,
      };
    }

    case 'SubagentStart': {
      // Use agent_id as the subagent session identifier, mapped to a UUID
      const subagentSessionId = getOrCreateSessionId(
        payload.agent_id ?? randomUUID(),
        payload.cwd ?? '',
      );
      return {
        event: {
          ...base,
          type: 'subagent_spawn',
          subagentSessionId,
        },
        requiresApproval: false,
      };
    }

    case 'SubagentStop': {
      const subagentSessionId = getOrCreateSessionId(
        payload.agent_id ?? randomUUID(),
        payload.cwd ?? '',
      );
      return {
        event: {
          ...base,
          type: 'subagent_complete',
          subagentSessionId,
          success: true,
        },
        requiresApproval: false,
      };
    }

    case 'PermissionRequest': {
      // PermissionRequest always requires approval
      const toolName = payload.tool_name ?? 'Unknown';
      const toolInput = payload.tool_input ?? {};
      const classification = classifyRisk(toolName, toolInput);
      return {
        event: {
          ...base,
          type: 'approval_request',
          approvalId: randomUUID(),
          actionType: classification.actionType,
          riskLevel: classification.riskLevel,
          proposedAction: JSON.stringify(toolInput),
          affectedPaths: [],
          whyRisky: classification.whyRisky,
        },
        requiresApproval: true,
      };
    }

    case 'Elicitation': {
      const mode = typeof payload.mode === 'string' ? payload.mode : 'form';
      const serverName = payload.mcp_server_name ?? 'unknown';
      const promptMessage = extractChatText(payload.message) ?? 'Provider requested user input';

      return {
        event: {
          ...base,
          type: 'approval_request',
          approvalId: randomUUID(),
          actionType: 'user_input',
          riskLevel: 'medium',
          proposedAction: promptMessage,
          affectedPaths: [],
          whyRisky:
            mode === 'url' && payload.url
              ? `MCP auth required via URL (${serverName}): ${payload.url}`
              : `MCP user input required (${serverName}, mode=${mode})`,
        },
        requiresApproval: true,
      };
    }

    case 'Stop': {
      const u = payload.usage;
      if (u && (u.input_tokens || u.output_tokens)) {
        const turnInput = u.input_tokens ?? 0;
        const turnOutput = u.output_tokens ?? 0;
        const turnCached = (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
        // Accumulate across turns so the UI always shows session-total counts
        const prev = tokenAccumulator.get(base.sessionId) ?? { input: 0, output: 0, cached: 0 };
        const acc = {
          input: prev.input + turnInput,
          output: prev.output + turnOutput,
          cached: prev.cached + turnCached,
        };
        tokenAccumulator.set(base.sessionId, acc);
        return {
          event: {
            ...base,
            type: 'session_usage',
            provider: 'claude',
            inputTokens: acc.input,
            outputTokens: acc.output,
            totalTokens: acc.input + acc.output,
            cachedInputTokens: acc.cached,
          },
          requiresApproval: false,
        };
      }
      return {
        event: {
          ...base,
          type: 'tool_call',
          toolName: 'Stop',
          input: {},
        },
        requiresApproval: false,
      };
    }

    case 'Notification':
    default: {
      const chatText =
        extractChatText(payload.message) ??
        extractChatText(payload.content) ??
        extractChatText(payload.tool_input);
      if (chatText) {
        return {
          event: {
            ...base,
            type: 'session_chat_message',
            provider: 'claude',
            role: 'assistant',
            content: chatText,
          },
          requiresApproval: false,
        };
      }
      // Informational — treat as tool_call
      return {
        event: {
          ...base,
          type: 'tool_call',
          toolName: payload.tool_name ?? payload.hook_event_name,
          input: payload.tool_input ?? {},
        },
        requiresApproval: false,
      };
    }
  }
}
