export type ActionType =
  | 'shell_command'
  | 'file_change'
  | 'network_access'
  | 'sandbox_escalation'
  | 'mcp_tool_call'
  | 'user_input';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

// High-risk command keywords — destructive, privilege-escalating, or network-fetching
const HIGH_RISK_COMMANDS = new Set([
  'rm',
  'sudo',
  'chmod',
  'chown',
  'kill',
  'pkill',
  'curl',
  'wget',
]);

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

    const isHighRisk = command.some((token) => HIGH_RISK_COMMANDS.has(token));

    return {
      actionType: 'shell_command',
      riskLevel: isHighRisk ? 'high' : 'medium',
      proposedAction,
      whyRisky: isHighRisk
        ? `Command contains high-risk token: ${command.find((t) => HIGH_RISK_COMMANDS.has(t))}`
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
