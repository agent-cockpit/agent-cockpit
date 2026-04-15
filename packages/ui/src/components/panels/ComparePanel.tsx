import type { SessionSummary } from '../../store/index.js'

function formatRuntime(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return 'in progress'
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function SessionSummaryCard({ summary }: { summary: SessionSummary }) {
  const statusColor =
    summary.finalStatus === 'active' ? 'var(--color-cockpit-green)' :
    summary.finalStatus === 'error' ? 'var(--color-cockpit-red)' :
    'var(--color-cockpit-dim)'

  return (
    <div className="cockpit-frame-full flex flex-col gap-3 p-4 bg-[var(--color-panel-surface)]">
      <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
      <span className="cockpit-corner cockpit-corner-br" aria-hidden />
      <div className="data-readout text-xs">{summary.sessionId.slice(0, 8)}</div>
      <dl className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <dt className="cockpit-label w-24 shrink-0">Provider</dt>
          <dd className={`px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${summary.provider === 'claude' ? 'badge-provider-claude' : 'badge-provider-codex'}`}>
            {summary.provider}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="cockpit-label w-24 shrink-0">Status</dt>
          <dd className="[font-family:var(--font-mono-data)] text-[10px] uppercase tracking-wide" style={{ color: statusColor }}>
            {summary.finalStatus}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="cockpit-label w-24 shrink-0">Runtime</dt>
          <dd className="data-readout text-[10px] tabular-nums">{formatRuntime(summary.startedAt, summary.endedAt)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="cockpit-label w-24 shrink-0">Approvals</dt>
          <dd className="data-readout text-[10px] tabular-nums">{summary.approvalCount}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="cockpit-label w-24 shrink-0">Files chgd</dt>
          <dd className="data-readout text-[10px] tabular-nums">{summary.filesChanged}</dd>
        </div>
      </dl>
    </div>
  )
}

export function ComparePanel({ left, right }: { left: SessionSummary; right: SessionSummary }) {
  return (
    <div className="grid grid-cols-2 h-full divide-x divide-border/50" data-testid="compare-panel">
      <div className="overflow-auto min-w-0">
        <SessionSummaryCard summary={left} />
      </div>
      <div className="overflow-auto min-w-0">
        <SessionSummaryCard summary={right} />
      </div>
    </div>
  )
}
