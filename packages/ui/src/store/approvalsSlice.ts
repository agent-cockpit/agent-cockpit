import type { NormalizedEvent } from '@agentcockpit/shared'

export interface PendingApproval {
  approvalId: string
  sessionId: string
  actionType: string
  riskLevel: string
  proposedAction: string
  affectedPaths: string[]
  whyRisky: string
  timestamp: string
}

export interface ApprovalsSlice {
  pendingApprovalsBySession: Record<string, PendingApproval[]>
  hydratePendingApprovals: (sessionId: string, approvals: PendingApproval[]) => void
}

// Module-level constant to avoid creating new [] references for empty sessions
export const EMPTY_APPROVALS: PendingApproval[] = []

export function applyEventToApprovals(
  state: Pick<ApprovalsSlice, 'pendingApprovalsBySession'>,
  event: NormalizedEvent,
): Pick<ApprovalsSlice, 'pendingApprovalsBySession'> {
  if (event.type === 'approval_request') {
    const existing = state.pendingApprovalsBySession[event.sessionId] ?? []
    // Dedup by approvalId — catch-up replay replays all events from lastSeenSequence
    if (existing.some((a) => a.approvalId === event.approvalId)) return state
    const approval: PendingApproval = {
      approvalId: event.approvalId,
      sessionId: event.sessionId,
      actionType: event.actionType,
      riskLevel: event.riskLevel,
      proposedAction: event.proposedAction,
      affectedPaths: event.affectedPaths ?? [],
      whyRisky: event.whyRisky ?? '',
      timestamp: event.timestamp,
    }
    return {
      pendingApprovalsBySession: {
        ...state.pendingApprovalsBySession,
        [event.sessionId]: [...existing, approval],
      },
    }
  }

  if (event.type === 'approval_resolved') {
    const existing = state.pendingApprovalsBySession[event.sessionId] ?? []
    const filtered = existing.filter((a) => a.approvalId !== event.approvalId)
    return {
      pendingApprovalsBySession: {
        ...state.pendingApprovalsBySession,
        [event.sessionId]: filtered,
      },
    }
  }

  return state
}
