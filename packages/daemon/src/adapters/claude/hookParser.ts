import { randomUUID } from 'node:crypto';
import type { NormalizedEvent } from '@cockpit/shared';
import { classifyRisk, requiresHumanApproval } from './riskClassifier.js';

export type HookPayload = {
  session_id: string;
  hook_event_name: string;
  cwd?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: Record<string, unknown>;
  agent_id?: string;
  transcript_path?: string;
  permission_mode?: string;
};

// Module-level session ID cache: Claude session_id → UUID
const sessionIdCache = new Map<string, string>();

function getOrCreateSessionId(claudeSessionId: string): string {
  let uuid = sessionIdCache.get(claudeSessionId);
  if (!uuid) {
    uuid = randomUUID();
    sessionIdCache.set(claudeSessionId, uuid);
  }
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
    sessionId: getOrCreateSessionId(payload.session_id),
    timestamp: new Date().toISOString(),
    provider: 'claude',
  };
}

export function parseHookPayload(payload: HookPayload): {
  event: NormalizedEvent;
  requiresApproval: boolean;
} {
  const base = baseFields(payload);

  switch (payload.hook_event_name) {
    case 'SessionStart': {
      return {
        event: {
          ...base,
          type: 'session_start',
          workspacePath: payload.cwd ?? '',
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
      const subagentSessionId = getOrCreateSessionId(payload.agent_id ?? randomUUID());
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
      const subagentSessionId = getOrCreateSessionId(payload.agent_id ?? randomUUID());
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
