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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseStructuredAction(raw: string): unknown | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (typeof parsed === 'string') {
      const nested = parsed.trim()
      if (
        (nested.startsWith('{') && nested.endsWith('}')) ||
        (nested.startsWith('[') && nested.endsWith(']'))
      ) {
        try {
          return JSON.parse(nested) as unknown
        } catch {
          return parsed
        }
      }
    }
    return parsed
  } catch {
    return null
  }
}

function formatStructuredAction(parsed: unknown): string {
  if (!isRecord(parsed)) {
    return JSON.stringify(parsed, null, 2)
  }

  const filePath = typeof parsed['file_path'] === 'string' ? parsed['file_path'] : null
  const oldString = typeof parsed['old_string'] === 'string' ? parsed['old_string'] : null
  const newString = typeof parsed['new_string'] === 'string' ? parsed['new_string'] : null
  const replaceAll = typeof parsed['replace_all'] === 'boolean' ? parsed['replace_all'] : null

  if (filePath || oldString !== null || newString !== null || replaceAll !== null) {
    const sections: string[] = []
    if (filePath) sections.push(`FILE\n${filePath}`)
    if (oldString !== null) sections.push(`OLD\n${oldString}`)
    if (newString !== null) sections.push(`NEW\n${newString}`)
    if (replaceAll !== null) sections.push(`REPLACE ALL\n${replaceAll ? 'true' : 'false'}`)

    const extras = Object.fromEntries(
      Object.entries(parsed).filter(([key]) => !['file_path', 'old_string', 'new_string', 'replace_all'].includes(key)),
    )
    if (Object.keys(extras).length > 0) {
      sections.push(`DETAILS\n${JSON.stringify(extras, null, 2)}`)
    }
    return sections.join('\n\n')
  }

  return JSON.stringify(parsed, null, 2)
}

function formatProposedAction(raw: string): string {
  const parsed = parseStructuredAction(raw)
  if (parsed === null) return raw
  return formatStructuredAction(parsed)
}

// ─── ApprovalCard ─────────────────────────────────────────────────────────────

interface ApprovalCardProps {
  approval: PendingApproval
  queuePosition: number
  disabled: boolean
  onDecision: (approvalId: string, decision: 'approve' | 'deny' | 'always_allow') => void
}

function ApprovalCard({ approval, queuePosition, disabled, onDecision }: ApprovalCardProps) {
  const formattedAction = formatProposedAction(approval.proposedAction)
  const buttonBase =
    'px-3 py-1.5 text-xs font-medium [font-family:var(--font-mono-data)] uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed transition-colors'

  return (
    <div className="cockpit-frame-full border border-border/80 p-4 mb-3 bg-[var(--color-panel-surface)]">
      <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
      <span className="cockpit-corner cockpit-corner-br" aria-hidden />

      {/* Header: action type + risk badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className="data-readout-dim text-[10px] tabular-nums">#{String(queuePosition).padStart(2, '0')}</span>
        <span className="[font-family:var(--font-mono-data)] text-xs font-semibold uppercase tracking-wide text-foreground">{formatActionType(approval.actionType)}</span>
        <RiskBadge level={approval.riskLevel as RiskLevel} />
        <span className="ml-auto data-readout-dim text-[10px] tabular-nums">
          {new Date(approval.timestamp).toLocaleTimeString()}
        </span>
      </div>

      {/* Proposed action */}
      <div className="mb-2">
        <span className="cockpit-label">Proposed action</span>
        <pre className="data-readout text-xs mt-0.5 whitespace-pre-wrap break-words leading-relaxed max-h-72 overflow-auto bg-[var(--color-panel-surface)]/65 border border-border/50 p-2">
          {formattedAction}
        </pre>
      </div>

      {/* Affected paths */}
      {approval.affectedPaths.length > 0 && (
        <div className="mb-2">
          <span className="cockpit-label">Affected paths</span>
          <ul className="mt-0.5">
            {approval.affectedPaths.map((path) => (
              <li key={path} className="text-xs [font-family:var(--font-mono-data)] text-muted-foreground">
                {path}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Why risky */}
      {approval.whyRisky && (
        <div className="mb-3">
          <span className="cockpit-label">Why risky</span>
          <p className="text-xs text-muted-foreground mt-0.5">{approval.whyRisky}</p>
        </div>
      )}

      {/* Decision buttons */}
      <div className="flex gap-2 mt-2">
        <button
          disabled={disabled}
          onClick={() => onDecision(approval.approvalId, 'approve')}
          className={`${buttonBase} bg-[var(--color-cockpit-green)]/20 border border-[var(--color-cockpit-green)]/50 text-[var(--color-cockpit-green)] hover:bg-[var(--color-cockpit-green)]/30`}
          aria-label="Approve"
        >
          Approve Once
        </button>
        <button
          disabled={disabled}
          onClick={() => onDecision(approval.approvalId, 'deny')}
          className={`${buttonBase} bg-[var(--color-cockpit-red)]/20 border border-[var(--color-cockpit-red)]/50 text-[var(--color-cockpit-red)] hover:bg-[var(--color-cockpit-red)]/30`}
          aria-label="Deny"
        >
          Deny
        </button>
        <button
          disabled={disabled}
          onClick={() => onDecision(approval.approvalId, 'always_allow')}
          className={`${buttonBase} bg-[color-mix(in_srgb,var(--color-cockpit-accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-cockpit-accent)_40%,transparent)] text-[var(--color-cockpit-accent)] hover:bg-[color-mix(in_srgb,var(--color-cockpit-accent)_20%,transparent)]`}
          aria-label="Always Allow"
        >
          Always Allow Rule
        </button>
      </div>
    </div>
  )
}

// ─── ApprovalInbox ────────────────────────────────────────────────────────────

export function ApprovalInbox() {
  const { sessionId: paramSessionId } = useParams<{ sessionId: string }>()
  const storeSessionId = useStore((s) => s.selectedSessionId)
  const sessionId = paramSessionId ?? storeSessionId ?? ''
  const approvals = useStore(
    (s) => s.pendingApprovalsBySession[sessionId ?? ''] ?? EMPTY_APPROVALS,
  )
  const wsStatus = useStore((s) => s.wsStatus)

  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set())

  function handleDecision(approvalId: string, decision: 'approve' | 'deny' | 'always_allow') {
    sendWsMessage({ type: 'approval_decision', approvalId, decision })
    setDecidedIds((prev) => new Set([...prev, approvalId]))
  }

  const riskRank: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  }

  const visibleApprovals = approvals
    .filter((a) => !decidedIds.has(a.approvalId))
    .sort((a, b) => {
      const riskDelta = (riskRank[a.riskLevel] ?? 9) - (riskRank[b.riskLevel] ?? 9)
      if (riskDelta !== 0) return riskDelta
      return b.timestamp.localeCompare(a.timestamp)
    })

  const isConnected = wsStatus === 'connected'

  return (
    <div className="flex flex-col p-4 overflow-y-auto h-full">
      {/* Header */}
      <div className="mb-3 border border-border/70 bg-[var(--color-panel-surface)] px-3 py-2">
        <div className="flex items-center gap-2">
          <h1 className="cockpit-label">Approval Queue</h1>
          <span className="data-readout text-[10px]">
            <span className="data-readout-dim">PENDING:&nbsp;</span>
            <span className="tabular-nums">{String(visibleApprovals.length).padStart(2, '0')}</span>
          </span>
        </div>
        <p className="mt-1 text-[10px] [font-family:var(--font-mono-data)] text-muted-foreground">
          Process approvals top-down. Higher-risk items are shown first.
        </p>
      </div>

      {!isConnected && (
        <div className="mb-3">
          <span
            className="inline-flex [font-family:var(--font-mono-data)] text-xs text-amber-200 bg-amber-500/20 border border-amber-400/40 px-2 py-1"
            style={{ textShadow: '0 0 6px rgba(251,191,36,0.4)' }}
          >
            Reconnecting... decisions are temporarily disabled.
          </span>
        </div>
      )}

      {/* Content */}
      {visibleApprovals.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2">
          <p className="cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }}>-- QUEUE EMPTY --</p>
        </div>
      ) : (
        <div>
          {visibleApprovals.map((approval, idx) => (
            <ApprovalCard
              key={approval.approvalId}
              approval={approval}
              queuePosition={idx + 1}
              disabled={!isConnected}
              onDecision={handleDecision}
            />
          ))}
        </div>
      )}
    </div>
  )
}
