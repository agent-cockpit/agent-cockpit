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

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .trim()
      .split(/\s+/)
      .filter((entry) => entry.length > 0);
  }
  return [];
}

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

function extractCommandTokens(method: string, params: Record<string, unknown>): string[] {
  if (method === 'execCommandApproval') {
    return toStringArray(params['command']);
  }

  const direct = toStringArray(params['command']);
  if (direct.length > 0) return direct;

  const item = params['item'] as Record<string, unknown> | undefined;
  const fromItem = toStringArray(item?.['command']);
  if (fromItem.length > 0) return fromItem;

  const cwd = typeof params['cwd'] === 'string' ? params['cwd'] : undefined;
  const fallback = typeof item?.['cwd'] === 'string' ? item['cwd'] : cwd;
  return fallback ? [fallback] : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((entry) => entry.length > 0))];
}

function extractFilePathsFromRequest(params: Record<string, unknown>): string[] {
  const item = params['item'] as Record<string, unknown> | undefined;
  const directPath = typeof item?.['path'] === 'string'
    ? [item['path']]
    : typeof params['path'] === 'string' ? [params['path']] : [];

  const fromChanges = Array.isArray(item?.['changes'])
    ? (item?.['changes'] as Array<Record<string, unknown>>)
        .map((change) => change?.['path'])
        .filter((path): path is string => typeof path === 'string' && path.length > 0)
    : [];

  return uniqueStrings([...directPath, ...fromChanges]);
}

function extractFilePathsFromPatch(params: Record<string, unknown>): string[] {
  const fileChanges = params['fileChanges'];
  if (!fileChanges || typeof fileChanges !== 'object') return [];
  return uniqueStrings(Object.keys(fileChanges as Record<string, unknown>));
}

function extractPermissionPaths(params: Record<string, unknown>): string[] {
  const permissions = params['permissions'];
  if (!permissions || typeof permissions !== 'object') return [];
  const fileSystem = (permissions as Record<string, unknown>)['fileSystem'];
  if (!fileSystem || typeof fileSystem !== 'object') return [];
  const fsRecord = fileSystem as Record<string, unknown>;
  const buckets = ['read', 'write', 'create', 'delete'];
  const paths: string[] = [];
  for (const bucket of buckets) {
    const value = fsRecord[bucket];
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      if (typeof entry === 'string' && entry.length > 0) paths.push(entry);
    }
  }
  return uniqueStrings(paths);
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
  if (method === 'item/commandExecution/requestApproval' || method === 'execCommandApproval') {
    const command = extractCommandTokens(method, params);
    const proposedAction = command.join(' ').trim() || 'run command';

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
    const affectedPaths = extractFilePathsFromRequest(params);
    const pathSummary = affectedPaths.length > 0 ? affectedPaths.join(', ') : 'pending file changes';
    const reason = typeof params['reason'] === 'string' && params['reason'].trim().length > 0
      ? params['reason'].trim()
      : undefined;

    return {
      actionType: 'file_change',
      riskLevel: 'medium',
      proposedAction: reason ? `${reason} (${pathSummary})` : `apply patch (${pathSummary})`,
      affectedPaths: affectedPaths.length > 0 ? affectedPaths : undefined,
    };
  }

  if (method === 'applyPatchApproval') {
    const affectedPaths = extractFilePathsFromPatch(params);
    const reason = typeof params['reason'] === 'string' && params['reason'].trim().length > 0
      ? params['reason'].trim()
      : undefined;
    return {
      actionType: 'file_change',
      riskLevel: 'medium',
      proposedAction: reason
        ? `${reason} (${affectedPaths.length > 0 ? affectedPaths.join(', ') : 'patch'})`
        : `apply patch (${affectedPaths.length > 0 ? affectedPaths.join(', ') : 'unknown files'})`,
      affectedPaths: affectedPaths.length > 0 ? affectedPaths : undefined,
    };
  }

  if (method === 'item/permissions/requestApproval') {
    const reason = typeof params['reason'] === 'string' && params['reason'].trim().length > 0
      ? params['reason'].trim()
      : 'request additional permissions';
    const affectedPaths = extractPermissionPaths(params);
    return {
      actionType: 'sandbox_escalation',
      riskLevel: 'high',
      proposedAction: reason,
      affectedPaths: affectedPaths.length > 0 ? affectedPaths : undefined,
      whyRisky: 'Requests additional sandbox or filesystem/network permissions.',
    };
  }

  // Unknown method — fallback
  return {
    actionType: 'shell_command',
    riskLevel: 'medium',
    proposedAction: method,
  };
}
