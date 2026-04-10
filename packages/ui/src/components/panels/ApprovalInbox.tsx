import { useState } from 'react'
import { useParams } from 'react-router'
import { useStore } from '../../store/index.js'
import { sendWsMessage } from '../../hooks/useSessionEvents.js'
import { EMPTY_APPROVALS } from '../../store/approvalsSlice.js'
import type { PendingApproval } from '../../store/approvalsSlice.js'
import { RiskBadge } from '../RiskBadge.js'
import type { RiskLevel } from '../RiskBadge.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatActionType(actionType: string): string {
  return actionType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// ─── ApprovalCard ─────────────────────────────────────────────────────────────

interface ApprovalCardProps {
  approval: PendingApproval
  disabled: boolean
  onDecision: (approvalId: string, decision: 'approve' | 'deny' | 'always_allow') => void
}

function ApprovalCard({ approval, disabled, onDecision }: ApprovalCardProps) {
  const buttonBase =
    'px-3 py-1.5 text-xs font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <div className="border rounded-lg p-4 mb-3 bg-white shadow-sm">
      {/* Header: action type + risk badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold">{formatActionType(approval.actionType)}</span>
        <RiskBadge level={approval.riskLevel as RiskLevel} />
      </div>

      {/* Proposed action */}
      <div className="mb-2">
        <span className="text-xs text-gray-500 uppercase tracking-wide">Proposed action</span>
        <p className="text-sm font-mono mt-0.5">{approval.proposedAction}</p>
      </div>

      {/* Affected paths */}
      {approval.affectedPaths.length > 0 && (
        <div className="mb-2">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Affected paths</span>
          <ul className="mt-0.5">
            {approval.affectedPaths.map((path) => (
              <li key={path} className="text-xs font-mono text-gray-700">
                {path}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Why risky */}
      {approval.whyRisky && (
        <div className="mb-3">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Why risky</span>
          <p className="text-xs text-gray-700 mt-0.5">{approval.whyRisky}</p>
        </div>
      )}

      {/* Decision buttons */}
      <div className="flex gap-2 mt-2">
        <button
          disabled={disabled}
          onClick={() => onDecision(approval.approvalId, 'approve')}
          className={`${buttonBase} bg-green-600 text-white hover:bg-green-700`}
          aria-label="Approve"
        >
          Approve
        </button>
        <button
          disabled={disabled}
          onClick={() => onDecision(approval.approvalId, 'deny')}
          className={`${buttonBase} bg-red-600 text-white hover:bg-red-700`}
          aria-label="Deny"
        >
          Deny
        </button>
        <button
          disabled={disabled}
          onClick={() => onDecision(approval.approvalId, 'always_allow')}
          className={`${buttonBase} bg-blue-600 text-white hover:bg-blue-700`}
          aria-label="Always Allow"
        >
          Always Allow
        </button>
      </div>
    </div>
  )
}

// ─── ApprovalInbox ────────────────────────────────────────────────────────────

export function ApprovalInbox() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const approvals = useStore(
    (s) => s.pendingApprovalsBySession[sessionId ?? ''] ?? EMPTY_APPROVALS,
  )
  const wsStatus = useStore((s) => s.wsStatus)

  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set())

  function handleDecision(approvalId: string, decision: 'approve' | 'deny' | 'always_allow') {
    sendWsMessage({ type: 'approval_decision', approvalId, decision })
    setDecidedIds((prev) => new Set([...prev, approvalId]))
  }

  const visibleApprovals = approvals.filter((a) => !decidedIds.has(a.approvalId))
  const isConnected = wsStatus === 'connected'

  return (
    <div className="flex flex-col p-4 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <h1 className="text-sm font-semibold">Approval Inbox</h1>
        {!isConnected && (
          <span className="text-xs text-amber-700 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5">
            Reconnecting...
          </span>
        )}
      </div>

      {/* Content */}
      {visibleApprovals.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-gray-400">
          <p className="text-sm">No pending approvals</p>
        </div>
      ) : (
        <div>
          {visibleApprovals.map((approval) => (
            <ApprovalCard
              key={approval.approvalId}
              approval={approval}
              disabled={!isConnected}
              onDecision={handleDecision}
            />
          ))}
        </div>
      )}
    </div>
  )
}
