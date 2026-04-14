import { randomUUID } from 'node:crypto';
import type { NormalizedEvent } from '@cockpit/shared';
import type Database from 'better-sqlite3';
import { classifyRisk, requiresHumanApproval } from './riskClassifier.js';
import { getClaudeSessionId, setClaudeSessionId } from '../../db/queries.js';

export type HookPayload = {
  session_id: string;
  hook_event_name: string;
  cwd?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: Record<string, unknown>;
  message?: string;
  content?: string;
  agent_id?: string;
  transcript_path?: string;
  permission_mode?: string;
};

// Module-level session ID cache: Claude session_id → UUID
// Replaced by DB-backed three-tier lookup; initialized at daemon startup
let claudeSessionCache = new Map<string, string>();

// Module-level DB reference — set by daemon entrypoint at startup
let claudeSessionDb: Database.Database | null = null;

const EXTERNAL_SESSION_REASON = 'External session is approval-only; chat send is disabled.';

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

      if (requiresHumanApproval(toolName, toolInput)) {
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
      return {
        event: {
          ...base,
          type: 'tool_call',
          toolName: payload.tool_name ?? 'Unknown',
          input: payload.tool_input ?? {},
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
