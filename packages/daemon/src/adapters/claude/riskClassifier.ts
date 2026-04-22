export type ActionType =
  | 'shell_command'
  | 'file_change'
  | 'network_access'
  | 'sandbox_escalation'
  | 'mcp_tool_call'
  | 'user_input';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskClassification {
  actionType: ActionType;
  riskLevel: RiskLevel;
  whyRisky: string;
}

// Built-in Claude Code tool names
const BUILTIN_TOOLS = new Set([
  'Bash',
  'Write',
  'Edit',
  'Read',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'Agent',
  'AskUserQuestion',
]);

// Critical patterns: destructive, privilege escalation, or remote code execution.
const CRITICAL_BASH_PATTERN = /\brm\s+-rf\b|\bsudo\b|\bchmod\s+777\b|\bcurl\b[^\n|]*\|\s*sh\b|\bwget\b[^\n|]*\|\s*sh\b/i;

// High-risk patterns: external side effects (remote execution/publish).
const HIGH_BASH_PATTERN = /\bssh\b|\bscp\b|\brsync\b|git\s+push\b|npm\s+publish\b|pnpm\s+publish\b|yarn\s+publish\b|twine\s+upload\b/i;

// Medium-risk network fetch patterns: read-only retrieval.
const MEDIUM_NETWORK_BASH_PATTERN = /\bcurl\b|\bwget\b/i;

export function classifyRisk(
  toolName: string,
  toolInput: Record<string, unknown>,
): RiskClassification {
  if (toolName === 'Bash') {
    const command = typeof toolInput['command'] === 'string' ? toolInput['command'] : '';

    if (CRITICAL_BASH_PATTERN.test(command)) {
      return {
        actionType: 'shell_command',
        riskLevel: 'critical',
        whyRisky: `Command matches critical-risk pattern: ${command.slice(0, 120)}`,
      };
    }

    if (HIGH_BASH_PATTERN.test(command)) {
      return {
        actionType: 'network_access',
        riskLevel: 'high',
        whyRisky: `Command performs side-effect network operation: ${command.slice(0, 120)}`,
      };
    }

    if (MEDIUM_NETWORK_BASH_PATTERN.test(command)) {
      return {
        actionType: 'network_access',
        riskLevel: 'medium',
        whyRisky: `Command performs read-only network fetch: ${command.slice(0, 120)}`,
      };
    }

    return {
      actionType: 'shell_command',
      riskLevel: 'medium',
      whyRisky: `Shell command execution: ${command.slice(0, 120)}`,
    };
  }

  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'Update' || toolName === 'MultiEdit') {
    const filePath =
      typeof toolInput['path'] === 'string'
        ? toolInput['path']
        : typeof toolInput['file_path'] === 'string'
          ? toolInput['file_path']
          : 'unknown';
    return {
      actionType: 'file_change',
      riskLevel: 'low',
      whyRisky: `File modification: ${filePath}`,
    };
  }

  if (toolName === 'WebFetch' || toolName === 'WebSearch') {
    return {
      actionType: 'network_access',
      riskLevel: 'medium',
      whyRisky: `Web access via ${toolName}`,
    };
  }

  if (toolName === 'AskUserQuestion') {
    return {
      actionType: 'user_input',
      riskLevel: 'low',
      whyRisky: 'Requesting user input',
    };
  }

  // Unknown tools (not in built-in list) are MCP tools
  if (!BUILTIN_TOOLS.has(toolName)) {
    return {
      actionType: 'mcp_tool_call',
      riskLevel: 'medium',
      whyRisky: `Unknown/MCP tool: ${toolName}`,
    };
  }

  // Other built-in tools (Read, Glob, Grep, Agent) — low risk informational
  return {
    actionType: 'mcp_tool_call',
    riskLevel: 'low',
    whyRisky: `Built-in tool: ${toolName}`,
  };
}
