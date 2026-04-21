export type ActionType =
  | 'shell_command'
  | 'file_change'
  | 'network_access'
  | 'sandbox_escalation'
  | 'mcp_tool_call'
  | 'user_input';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

// High-risk command tokens — destructive or privilege-escalating operations.
const HIGH_RISK_COMMAND_TOKENS = new Set([
  'rm',
  'sudo',
  'chmod',
  'chown',
  'kill',
  'pkill',
  'reboot',
  'shutdown',
  'mkfs',
  'dd',
]);

// High-risk command pairs — operations with clear external side effects.
const HIGH_RISK_COMMAND_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['git', 'push'],
  ['npm', 'publish'],
  ['pnpm', 'publish'],
  ['yarn', 'publish'],
];

function findHighRiskCommandMatch(command: string[]): string | null {
  const normalized = command.map((token) => token.toLowerCase());

  for (const token of normalized) {
    if (HIGH_RISK_COMMAND_TOKENS.has(token)) return token;
  }

  for (let i = 0; i < normalized.length - 1; i += 1) {
    const first = normalized[i];
    const second = normalized[i + 1];
    if (!first || !second) continue;

    if (HIGH_RISK_COMMAND_PAIRS.some(([a, b]) => a === first && b === second)) {
      return `${first} ${second}`;
    }
  }

  return null;
}

export function classifyCodexApproval(
  method: string,
  params: Record<string, unknown>,
): {
  actionType: ActionType;
  riskLevel: RiskLevel;
  proposedAction: string;
  affectedPaths?: string[];
  whyRisky?: string;
} {
  if (method === 'item/commandExecution/requestApproval') {
    const item = params['item'] as Record<string, unknown> | undefined;
    const command = (item?.['command'] as string[] | undefined) ?? [];
    const proposedAction = command.join(' ');

    const highRiskMatch = findHighRiskCommandMatch(command);

    return {
      actionType: 'shell_command',
      riskLevel: highRiskMatch ? 'high' : 'medium',
      proposedAction,
      whyRisky: highRiskMatch
        ? `Command contains high-risk operation: ${highRiskMatch}`
        : undefined,
    };
  }

  if (method === 'item/fileChange/requestApproval') {
    const item = params['item'] as Record<string, unknown> | undefined;
    const path = (item?.['path'] as string | undefined) ?? '';
    const changeType = (item?.['changeType'] as string | undefined) ?? 'modified';

    const verbMap: Record<string, string> = {
      created: 'create',
      modified: 'modify',
      deleted: 'delete',
    };
    const verb = verbMap[changeType] ?? 'modify';

    return {
      actionType: 'file_change',
      riskLevel: 'medium',
      proposedAction: `${verb} ${path}`,
      affectedPaths: path ? [path] : undefined,
    };
  }

  // Unknown method — fallback
  return {
    actionType: 'shell_command',
    riskLevel: 'medium',
    proposedAction: method,
  };
}
