import { useState, type MutableRefObject } from 'react'
import { useStore } from '../../store/index.js'
import { sendWsMessage } from '../../hooks/useSessionEvents.js'
import type { PendingApproval } from '../../store/approvalsSlice.js'

interface ApprovalBalloonOverlayProps {
  balloonRefsMap: MutableRefObject<Map<string, HTMLDivElement | null>>
}

function formatActionType(actionType: string): string {
  return actionType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function shorten(text: string): string {
  return text.length > 72 ? text.slice(0, 72) + '…' : text
}

function extractPreview(proposedAction: string): string {
  const trimmed = proposedAction.trim()
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>

      // AskUserQuestion shape: { questions: [{ question: "..." }] }
      if (Array.isArray(obj['questions'])) {
        const first = (obj['questions'] as unknown[])[0]
        if (typeof first === 'object' && first !== null) {
          const q = (first as Record<string, unknown>)['question']
          if (typeof q === 'string') return shorten(q)
        }
      }

      // Priority order for other tool inputs
      const text =
        typeof obj['command'] === 'string' ? obj['command'] :
        Array.isArray(obj['command']) ? (obj['command'] as unknown[]).join(' ') :
        typeof obj['question'] === 'string' ? obj['question'] :
        typeof obj['prompt'] === 'string' ? obj['prompt'] :
        typeof obj['file_path'] === 'string' ? obj['file_path'] :
        typeof obj['url'] === 'string' ? obj['url'] :
        typeof obj['pattern'] === 'string' ? obj['pattern'] :
        null
      if (text) return shorten(text)
    }
  } catch {
    // not JSON — fall through
  }
  const firstLine = trimmed.split('\n')[0] ?? trimmed
  return shorten(firstLine)
}

interface BalloonCardProps {
  approval: PendingApproval
  extraCount: number
  disabled: boolean
  onDecision: (approvalId: string, decision: 'approve' | 'deny' | 'always_allow') => void
}

function BalloonCard({ approval, extraCount, disabled, onDecision }: BalloonCardProps) {
  const preview = extractPreview(approval.proposedAction)
  const btnBase =
    'px-2 py-0.5 text-[9px] [font-family:var(--font-mono-data)] font-semibold uppercase tracking-wide ' +
    'disabled:opacity-50 disabled:cursor-not-allowed transition-colors leading-snug whitespace-nowrap'

  return (
    <div
      className="relative bg-[var(--color-panel-surface)] border border-amber-400/60 px-3 py-2 min-w-[180px] max-w-[260px]"
      style={{ boxShadow: '0 0 14px rgba(251,191,36,0.18), 0 2px 8px rgba(0,0,0,0.5)' }}
    >
      {/* Action type + extra badge */}
      <div className="flex items-center gap-2 mb-1">
        <span className="[font-family:var(--font-mono-data)] text-[9px] font-semibold uppercase tracking-wider text-amber-300 leading-none">
          {formatActionType(approval.actionType)}
        </span>
        {extraCount > 0 && (
          <span className="text-[8px] [font-family:var(--font-mono-data)] bg-amber-500/20 text-amber-300 border border-amber-400/40 px-1 leading-tight">
            +{extraCount}
          </span>
        )}
      </div>

      {/* Proposed action preview */}
      <p className="[font-family:var(--font-mono-data)] text-[10px] text-foreground/90 mb-2 leading-snug break-all">
        {preview}
      </p>

      {/* Decision buttons */}
      <div className="flex gap-1.5">
        <button
          disabled={disabled}
          onClick={() => onDecision(approval.approvalId, 'approve')}
          className={`${btnBase} bg-[var(--color-cockpit-green)]/20 border border-[var(--color-cockpit-green)]/50 text-[var(--color-cockpit-green)] hover:bg-[var(--color-cockpit-green)]/30`}
          aria-label="Approve"
        >
          Approve
        </button>
        <button
          disabled={disabled}
          onClick={() => onDecision(approval.approvalId, 'always_allow')}
          className={`${btnBase} bg-[color-mix(in_srgb,var(--color-cockpit-accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-cockpit-accent)_40%,transparent)] text-[var(--color-cockpit-accent)] hover:bg-[color-mix(in_srgb,var(--color-cockpit-accent)_20%,transparent)]`}
          aria-label="Always Allow"
        >
          Always
        </button>
        <button
          disabled={disabled}
          onClick={() => onDecision(approval.approvalId, 'deny')}
          className={`${btnBase} bg-[var(--color-cockpit-red)]/20 border border-[var(--color-cockpit-red)]/50 text-[var(--color-cockpit-red)] hover:bg-[var(--color-cockpit-red)]/30`}
          aria-label="Deny"
        >
          Deny
        </button>
      </div>

      {/* Tail — rotated square creates a downward-pointing diamond tip */}
      <div
        className="absolute left-1/2 -translate-x-1/2 -bottom-[6px] w-[10px] h-[10px] rotate-45"
        style={{
          background: 'var(--color-panel-surface)',
          borderRight: '1px solid rgba(251,191,36,0.6)',
          borderBottom: '1px solid rgba(251,191,36,0.6)',
        }}
        aria-hidden
      />
    </div>
  )
}

export function ApprovalBalloonOverlay({ balloonRefsMap }: ApprovalBalloonOverlayProps) {
  const pendingApprovalsBySession = useStore((s) => s.pendingApprovalsBySession)
  const wsStatus = useStore((s) => s.wsStatus)
  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set())

  const isConnected = wsStatus === 'connected'

  function handleDecision(approvalId: string, decision: 'approve' | 'deny' | 'always_allow') {
    sendWsMessage({ type: 'approval_decision', approvalId, decision })
    setDecidedIds((prev) => new Set([...prev, approvalId]))
  }

  const sessionsWithApprovals = Object.entries(pendingApprovalsBySession)
    .map(([sessionId, approvals]) => ({
      sessionId,
      visibleApprovals: approvals.filter((a) => !decidedIds.has(a.approvalId)),
    }))
    .filter(({ visibleApprovals }) => visibleApprovals.length > 0)

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {sessionsWithApprovals.map(({ sessionId, visibleApprovals }) => {
        const approval = visibleApprovals[0]!
        const extraCount = visibleApprovals.length - 1
        return (
          <div
            key={sessionId}
            ref={(el) => {
              if (el) balloonRefsMap.current.set(sessionId, el)
              else balloonRefsMap.current.delete(sessionId)
            }}
            className="absolute pointer-events-auto"
            // Initially hidden; OfficePage.update() sets display + left/top each frame
            style={{ display: 'none', transform: 'translate(-50%, calc(-100% - 14px))' }}
          >
            <BalloonCard
              approval={approval}
              extraCount={extraCount}
              disabled={!isConnected}
              onDecision={handleDecision}
            />
          </div>
        )
      })}
    </div>
  )
}
