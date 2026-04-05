import type Database from 'better-sqlite3';

export interface ApprovalRow {
  approvalId: string;
  sessionId: string;
  status: string;
  actionType: string;
  riskLevel: string;
  proposedAction: string;
  affectedPaths: string[] | null;
  whyRisky: string | null;
  createdAt: string;
  decidedAt: string | null;
  decisionReason: string | null;
}

interface InsertApprovalParams {
  approvalId: string;
  sessionId: string;
  actionType: string;
  riskLevel: string;
  proposedAction: string;
  affectedPaths: string[];
  whyRisky: string;
  createdAt: string;
}

interface AlwaysAllowRuleParams {
  sessionId: string;
  toolName: string;
  pattern: string;
  createdAt: string;
}

interface RawApprovalRow {
  approval_id: string;
  session_id: string;
  status: string;
  action_type: string;
  risk_level: string;
  proposed_action: string;
  affected_paths: string | null;
  why_risky: string | null;
  created_at: string;
  decided_at: string | null;
  decision_reason: string | null;
}

function mapRow(raw: RawApprovalRow): ApprovalRow {
  return {
    approvalId: raw.approval_id,
    sessionId: raw.session_id,
    status: raw.status,
    actionType: raw.action_type,
    riskLevel: raw.risk_level,
    proposedAction: raw.proposed_action,
    affectedPaths: raw.affected_paths != null ? (JSON.parse(raw.affected_paths) as string[]) : null,
    whyRisky: raw.why_risky,
    createdAt: raw.created_at,
    decidedAt: raw.decided_at,
    decisionReason: raw.decision_reason,
  };
}

export function insertApproval(db: Database.Database, params: InsertApprovalParams): void {
  db.prepare(`
    INSERT INTO approvals
      (approval_id, session_id, status, action_type, risk_level, proposed_action, affected_paths, why_risky, created_at)
    VALUES
      (@approvalId, @sessionId, 'pending', @actionType, @riskLevel, @proposedAction, @affectedPaths, @whyRisky, @createdAt)
  `).run({
    ...params,
    affectedPaths: JSON.stringify(params.affectedPaths),
  });
}

export function getApprovalById(db: Database.Database, approvalId: string): ApprovalRow | undefined {
  const raw = db.prepare('SELECT * FROM approvals WHERE approval_id = ?').get(approvalId) as RawApprovalRow | undefined;
  if (!raw) return undefined;
  return mapRow(raw);
}

export function updateApprovalDecision(
  db: Database.Database,
  approvalId: string,
  status: 'approved' | 'denied' | 'always_allow' | 'timeout',
  reason: string | undefined,
): void {
  db.prepare(`
    UPDATE approvals
    SET status = @status, decided_at = @decidedAt, decision_reason = @reason
    WHERE approval_id = @approvalId
  `).run({
    approvalId,
    status,
    decidedAt: new Date().toISOString(),
    reason: reason ?? null,
  });
}

export function insertAlwaysAllowRule(db: Database.Database, params: AlwaysAllowRuleParams): void {
  db.prepare(`
    INSERT INTO always_allow_rules (session_id, tool_name, pattern, created_at)
    VALUES (@sessionId, @toolName, @pattern, @createdAt)
  `).run(params);
}
