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
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="text-sm font-semibold">{summary.sessionId.slice(0, 8)}</div>
      <dl className="flex flex-col gap-1 text-xs">
        <div><dt className="text-muted-foreground inline">Provider</dt>{' '}<dd className="inline font-medium">{summary.provider}</dd></div>
        <div><dt className="text-muted-foreground inline">Status</dt>{' '}<dd className="inline font-medium">{summary.finalStatus}</dd></div>
        <div><dt className="text-muted-foreground inline">Runtime</dt>{' '}<dd className="inline">{formatRuntime(summary.startedAt, summary.endedAt)}</dd></div>
        <div><dt className="text-muted-foreground inline">Approvals</dt>{' '}<dd className="inline">{summary.approvalCount}</dd></div>
        <div><dt className="text-muted-foreground inline">Files changed</dt>{' '}<dd className="inline">{summary.filesChanged}</dd></div>
      </dl>
    </div>
  )
}

export function ComparePanel({ left, right }: { left: SessionSummary; right: SessionSummary }) {
  return (
    <div className="grid grid-cols-2 h-full divide-x divide-border" data-testid="compare-panel">
      <div className="overflow-auto min-w-0">
        <SessionSummaryCard summary={left} />
      </div>
      <div className="overflow-auto min-w-0">
        <SessionSummaryCard summary={right} />
      </div>
    </div>
  )
}
