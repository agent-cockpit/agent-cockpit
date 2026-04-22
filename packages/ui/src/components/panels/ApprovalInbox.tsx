import { useEffect, useState } from 'react'
import { useStore } from '../../store/index.js'
import { sendWsMessage } from '../../hooks/useSessionEvents.js'
import { EMPTY_APPROVALS } from '../../store/approvalsSlice.js'
import type { PendingApproval } from '../../store/approvalsSlice.js'
import { DAEMON_URL } from '../../lib/daemonUrl.js'
import { RiskBadge } from '../RiskBadge.js'
import type { RiskLevel } from '../RiskBadge.js'
import { usePanelSessionId } from './sessionScope.js'

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
  queueTotal: number
  disabled: boolean
  onDecision: (approvalId: string, decision: 'approve' | 'deny' | 'always_allow') => void
}

const RISK_THEME: Record<
  string,
  {
    label: string
    railClass: string
    textClass: string
  }
> = {
  critical: {
    label: 'CRIT',
    railClass:
      'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-cockpit-red)_28%,transparent)_0%,color-mix(in_srgb,var(--color-cockpit-red)_16%,transparent)_100%)]',
    textClass: 'text-[var(--color-cockpit-red)]',
  },
  high: {
    label: 'HIGH',
    railClass:
      'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-cockpit-red)_24%,transparent)_0%,color-mix(in_srgb,var(--color-cockpit-red)_12%,transparent)_100%)]',
    textClass: 'text-[var(--color-cockpit-red)]',
  },
  medium: {
    label: 'MED',
    railClass:
      'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-cockpit-amber)_26%,transparent)_0%,color-mix(in_srgb,var(--color-cockpit-amber)_12%,transparent)_100%)]',
    textClass: 'text-[var(--color-cockpit-amber)]',
  },
  low: {
    label: 'LOW',
    railClass:
      'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-cockpit-green)_24%,transparent)_0%,color-mix(in_srgb,var(--color-cockpit-green)_10%,transparent)_100%)]',
    textClass: 'text-[var(--color-cockpit-green)]',
  },
}

function ApprovalCard({
  approval,
  queuePosition,
  queueTotal,
  disabled,
  onDecision,
}: ApprovalCardProps) {
  const formattedAction = formatProposedAction(approval.proposedAction)
  const actionLabel = formatActionType(approval.actionType)
  const riskTheme = RISK_THEME[approval.riskLevel] ?? RISK_THEME.low
  const buttonBase =
    'h-9 w-full border px-3 text-[10px] font-semibold [font-family:var(--font-mono-data)] uppercase tracking-[0.14em] disabled:opacity-45 disabled:cursor-not-allowed transition-colors'

  return (
    <div className="cockpit-frame-full mb-3 overflow-hidden border border-[color-mix(in_srgb,var(--color-cockpit-accent)_28%,var(--color-border))] bg-[linear-gradient(180deg,oklch(0.17_0.028_252)_0%,oklch(0.16_0.028_252)_100%)]">
      <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
      <span className="cockpit-corner cockpit-corner-br" aria-hidden />

      <div className="grid grid-cols-1 md:grid-cols-[68px_minmax(0,1fr)_154px]">
        <div
          className={`flex items-center justify-between gap-3 border-b border-[color-mix(in_srgb,var(--color-border)_80%,transparent)] px-3 py-2 md:flex-col md:justify-center md:gap-2 md:border-b-0 md:border-r md:px-1 ${riskTheme.railClass}`}
        >
          <span
            className={`[font-family:var(--font-mono-data)] text-[10px] font-semibold uppercase tracking-[0.18em] ${riskTheme.textClass}`}
          >
            {riskTheme.label}
          </span>
          <span className="data-readout-dim text-[10px] tabular-nums">
            {queuePosition}/{queueTotal}
          </span>
        </div>

        <div className="p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="[font-family:var(--font-mono-data)] text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-cockpit-cyan)]">
              {actionLabel}
            </span>
            <span className="data-readout-dim text-[10px] uppercase tracking-[0.12em]">
              #{String(queuePosition).padStart(2, '0')} of {String(queueTotal).padStart(2, '0')}
            </span>
            <RiskBadge level={approval.riskLevel as RiskLevel} />
            <span className="ml-auto data-readout-dim text-[10px] tabular-nums">
              {new Date(approval.timestamp).toLocaleTimeString()}
            </span>
          </div>

          <div className="border border-[color-mix(in_srgb,var(--color-cockpit-cyan)_20%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-cockpit-cyan)_8%,transparent)] p-2">
            <span className="block [font-family:var(--font-mono-data)] text-[10px] uppercase tracking-[0.14em] text-[var(--color-cockpit-dim)]">
              Requested Command
            </span>
            <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words [font-family:var(--font-mono-data)] text-[12px] leading-relaxed text-foreground">
              {formattedAction}
            </pre>
          </div>

          {approval.affectedPaths.length > 0 && (
            <div className="mt-2">
              <span className="block [font-family:var(--font-mono-data)] text-[10px] uppercase tracking-[0.14em] text-[var(--color-cockpit-dim)]">
                Affected Paths
              </span>
              <ul className="mt-1 space-y-0.5">
                {approval.affectedPaths.map((path) => (
                  <li
                    key={path}
                    className="break-all [font-family:var(--font-mono-data)] text-[11px] text-muted-foreground"
                  >
                    {path}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {approval.whyRisky && (
            <div className="mt-2">
              <span className="block [font-family:var(--font-mono-data)] text-[10px] uppercase tracking-[0.14em] text-[var(--color-cockpit-dim)]">
                Why Risky
              </span>
              <p className="mt-1 text-xs text-muted-foreground">{approval.whyRisky}</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-[color-mix(in_srgb,var(--color-border)_80%,transparent)] p-3 md:flex-col md:border-t-0 md:border-l md:border-[color-mix(in_srgb,var(--color-border)_80%,transparent)]">
          <button
            disabled={disabled}
            onClick={() => onDecision(approval.approvalId, 'approve')}
            className={`${buttonBase} border-[color-mix(in_srgb,var(--color-cockpit-green)_58%,transparent)] bg-[color-mix(in_srgb,var(--color-cockpit-green)_18%,transparent)] text-[var(--color-cockpit-green)] hover:bg-[color-mix(in_srgb,var(--color-cockpit-green)_28%,transparent)]`}
            aria-label="Approve"
          >
            Allow
          </button>
          <button
            disabled={disabled}
            onClick={() => onDecision(approval.approvalId, 'deny')}
            className={`${buttonBase} border-[color-mix(in_srgb,var(--color-cockpit-red)_60%,transparent)] bg-[color-mix(in_srgb,var(--color-cockpit-red)_18%,transparent)] text-[var(--color-cockpit-red)] hover:bg-[color-mix(in_srgb,var(--color-cockpit-red)_28%,transparent)]`}
            aria-label="Deny"
          >
            Deny
          </button>
          <button
            disabled={disabled}
            onClick={() => onDecision(approval.approvalId, 'always_allow')}
            className={`${buttonBase} border-[color-mix(in_srgb,var(--color-cockpit-cyan)_50%,transparent)] bg-[color-mix(in_srgb,var(--color-cockpit-cyan)_14%,transparent)] text-[var(--color-cockpit-cyan)] hover:bg-[color-mix(in_srgb,var(--color-cockpit-cyan)_24%,transparent)]`}
            aria-label="Always Allow"
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ApprovalInbox ────────────────────────────────────────────────────────────

interface ApprovalDbRow {
  approvalId: string
  sessionId: string
  actionType: string
  riskLevel: string
  proposedAction: string
  affectedPaths: string[] | null
  whyRisky: string | null
  createdAt: string
  status: string
}

export function ApprovalInbox() {
  const sessionId = usePanelSessionId()
  const approvals = useStore(
    (s) => s.pendingApprovalsBySession[sessionId ?? ''] ?? EMPTY_APPROVALS,
  )
  const hydratePendingApprovals = useStore((s) => s.hydratePendingApprovals)
  const wsStatus = useStore((s) => s.wsStatus)

  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set())

  // Reconcile with DB on mount — removes stale approvals already resolved outside the UI
  useEffect(() => {
    if (!sessionId) return
    fetch(`${DAEMON_URL}/api/sessions/${sessionId}/approvals`)
      .then((r) => r.json())
      .then((rows: ApprovalDbRow[]) => {
        const pending: PendingApproval[] = rows
          .filter((r) => r.status === 'pending')
          .map((r) => ({
            approvalId: r.approvalId,
            sessionId: r.sessionId,
            actionType: r.actionType,
            riskLevel: r.riskLevel,
            proposedAction: r.proposedAction,
            affectedPaths: r.affectedPaths ?? [],
            whyRisky: r.whyRisky ?? '',
            timestamp: r.createdAt,
          }))
        hydratePendingApprovals(sessionId, pending)
      })
      .catch(() => {})
  }, [sessionId, hydratePendingApprovals])

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
    <div className="flex h-full flex-col overflow-y-auto bg-[linear-gradient(180deg,oklch(0.15_0.025_255)_0%,oklch(0.14_0.025_255)_100%)] p-4">
      <div className="mb-4 border border-[color-mix(in_srgb,var(--color-cockpit-amber)_45%,var(--color-border))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-cockpit-amber)_16%,transparent)_0%,color-mix(in_srgb,var(--color-cockpit-amber)_9%,transparent)_100%)] px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h1 className="cockpit-label text-[var(--color-cockpit-amber)]">Approval Queue</h1>
            <span className="inline-flex items-center border border-amber-300/55 bg-amber-500/20 px-1.5 py-0.5 [font-family:var(--font-mono-data)] text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200">
              {String(visibleApprovals.length).padStart(2, '0')} Pending
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 [font-family:var(--font-mono-data)] text-[10px] uppercase tracking-[0.12em] text-[var(--color-cockpit-dim)]">
            <span className="inline-flex items-center gap-1">
              <span className="inline-flex h-4 min-w-4 items-center justify-center border border-[color-mix(in_srgb,var(--color-cockpit-green)_60%,transparent)] bg-[color-mix(in_srgb,var(--color-cockpit-green)_14%,transparent)] px-1 text-[var(--color-cockpit-green)]">
                A
              </span>
              Allow
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-flex h-4 min-w-4 items-center justify-center border border-[color-mix(in_srgb,var(--color-cockpit-red)_60%,transparent)] bg-[color-mix(in_srgb,var(--color-cockpit-red)_14%,transparent)] px-1 text-[var(--color-cockpit-red)]">
                D
              </span>
              Deny
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-flex h-4 min-w-4 items-center justify-center border border-[color-mix(in_srgb,var(--color-cockpit-cyan)_55%,transparent)] bg-[color-mix(in_srgb,var(--color-cockpit-cyan)_12%,transparent)] px-1 text-[var(--color-cockpit-cyan)]">
                E
              </span>
              Edit
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="inline-flex items-center gap-1 text-foreground">
              <span className="inline-flex h-4 min-w-4 items-center justify-center border border-border/75 bg-background/50 px-1 text-muted-foreground">
                ↓
              </span>
              Next
            </span>
          </div>
        </div>
        <p className="mt-1 [font-family:var(--font-mono-data)] text-[10px] text-muted-foreground">
          Process from top to bottom. Higher-risk items are shown first.
        </p>
      </div>

      {!isConnected && (
        <div className="mb-3">
          <span
            className="inline-flex border border-amber-400/45 bg-amber-500/20 px-2 py-1 [font-family:var(--font-mono-data)] text-xs text-amber-200"
            style={{ textShadow: '0 0 6px rgba(251,191,36,0.4)' }}
          >
            Reconnecting... decisions are temporarily disabled.
          </span>
        </div>
      )}

      {/* Content */}
      {visibleApprovals.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 border border-dashed border-border/70 bg-background/30">
          <p className="cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }}>
            -- QUEUE EMPTY --
          </p>
        </div>
      ) : (
        <div>
          {visibleApprovals.map((approval, idx) => (
            <ApprovalCard
              key={approval.approvalId}
              approval={approval}
              queuePosition={idx + 1}
              queueTotal={visibleApprovals.length}
              disabled={!isConnected}
              onDecision={handleDecision}
            />
          ))}
        </div>
      )}
    </div>
  )
}
