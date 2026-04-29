import { useEffect, useState } from 'react'
import { DAEMON_URL } from '../../lib/daemonUrl.js'
import { getSessionTitle } from '../../lib/sessionTitle.js'
import {
  deriveTestSignal,
  extractChangedFiles,
  valueText,
  type SessionInsightEvent,
} from '../../lib/sessionInsights.js'
import type { SessionSummary } from '../../store/index.js'

interface SessionStats {
  tokens: { input: number; output: number; cached: number; total: number; model: string | null }
  toolCalls: { total: number; byTool: Array<{ toolName: string; count: number }> }
  fileChanges: { total: number; created: number; modified: number; deleted: number }
  approvals: { total: number; approved: number; denied: number }
  subagentSpawns: number
  duration: number | null
}

type CompareEvent = SessionInsightEvent

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return 'live'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

function useSessionStats(sessionId: string): SessionStats | null {
  const [stats, setStats] = useState<SessionStats | null>(null)
  useEffect(() => {
    fetch(`${DAEMON_URL}/api/sessions/${sessionId}/stats`)
      .then((r) => r.json() as Promise<SessionStats>)
      .then(setStats)
      .catch(() => {})
  }, [sessionId])
  return stats
}

function useSessionEvents(sessionId: string): CompareEvent[] | null {
  const [events, setEvents] = useState<CompareEvent[] | null>(null)
  useEffect(() => {
    fetch(`${DAEMON_URL}/api/sessions/${sessionId}/events`)
      .then((r) => r.json() as Promise<CompareEvent[]>)
      .then((rows) => setEvents(Array.isArray(rows) ? rows : []))
      .catch(() => setEvents([]))
  }, [sessionId])
  return events
}

function providerColor(provider: string) {
  return provider === 'claude' ? 'var(--color-provider-claude)' : 'var(--color-provider-codex)'
}

function statusColor(status: string) {
  if (status === 'active') return 'var(--color-cockpit-green)'
  if (status === 'error') return 'var(--color-cockpit-red)'
  return 'var(--color-cockpit-dim)'
}

function fileOverlap(leftFiles: string[], rightFiles: string[]) {
  const leftSet = new Set(leftFiles)
  const rightSet = new Set(rightFiles)
  return {
    shared: leftFiles.filter((file) => rightSet.has(file)),
    leftOnly: leftFiles.filter((file) => !rightSet.has(file)),
    rightOnly: rightFiles.filter((file) => !leftSet.has(file)),
  }
}

function excerpt(text: string, max = 180): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized
}

function deriveSummaryExcerpt(events: CompareEvent[]): string {
  const candidates = [...events].reverse()
  const sessionEnd = candidates.find((event) => event.type === 'session_end')
  const summarySource = sessionEnd ?? candidates.find((event) => event.content || event.message || event.output || event.reason || event.errorMessage)
  if (!summarySource) return 'No summary captured'

  const text = excerpt([
    valueText(summarySource.reason),
    valueText(summarySource.errorMessage),
    valueText(summarySource.message),
    valueText(summarySource.content),
    valueText(summarySource.output),
  ].filter(Boolean).join(' '))

  return text || 'No summary captured'
}

function relationLabel(summary: SessionSummary): string {
  const parts: string[] = []
  if (summary.parentSessionId) parts.push(`parent ${summary.parentSessionId.slice(0, 8)}`)
  const childCount = summary.childSessionIds?.length ?? 0
  if (childCount > 0) parts.push(`${childCount} child${childCount === 1 ? '' : 'ren'}`)
  return parts.length > 0 ? parts.join(' / ') : 'none'
}

// ── Section divider ────────────────────────────────────────────
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-0 my-0">
      <div className="flex-1 h-px bg-border/60" />
      <span
        className="px-3 py-1 text-[9px] tracking-[0.2em] uppercase font-mono"
        style={{ color: 'var(--color-cockpit-dim)', background: 'var(--color-background)' }}
      >
        {label}
      </span>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  )
}

// ── Single metric row: left value | label | right value ────────
function MetricRow({
  label,
  left,
  right,
  leftColor,
  rightColor,
  highlight,
}: {
  label: string
  left: string | number
  right: string | number
  leftColor?: string
  rightColor?: string
  highlight?: 'left' | 'right' | 'none'
}) {
  const lNum = typeof left === 'number' ? left : null
  const rNum = typeof right === 'number' ? right : null
  const win = highlight === 'none' ? null
    : lNum !== null && rNum !== null && lNum > rNum ? 'left'
    : lNum !== null && rNum !== null && rNum > lNum ? 'right'
    : null

  const leftVal = typeof left === 'number' ? fmt(left) : left
  const rightVal = typeof right === 'number' ? fmt(right) : right

  const leftFinal = leftColor ?? (win === 'left' ? 'var(--color-cockpit-cyan)' : 'var(--color-foreground)')
  const rightFinal = rightColor ?? (win === 'right' ? 'var(--color-cockpit-cyan)' : 'var(--color-foreground)')

  return (
    <div className="grid items-center font-mono text-[11px]" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
      <span
        className="text-right tabular-nums pr-4 py-0.5 text-base font-semibold"
        style={{ color: leftFinal }}
      >
        {leftVal}
      </span>
      <span className="text-center text-[9px] uppercase tracking-[0.15em] text-muted-foreground w-24 shrink-0">
        {label}
      </span>
      <span
        className="text-left tabular-nums pl-4 py-0.5 text-base font-semibold"
        style={{ color: rightFinal }}
      >
        {rightVal}
      </span>
    </div>
  )
}

function TextCompareRow({
  label,
  left,
  right,
  leftColor,
  rightColor,
}: {
  label: string
  left: string
  right: string
  leftColor?: string
  rightColor?: string
}) {
  return (
    <div className="grid items-start font-mono text-[11px]" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
      <span className="text-right pr-4 py-1 leading-snug" style={{ color: leftColor ?? 'var(--color-foreground)' }}>
        {left}
      </span>
      <span className="text-center text-[9px] uppercase tracking-[0.15em] text-muted-foreground w-24 shrink-0 py-1">
        {label}
      </span>
      <span className="text-left pl-4 py-1 leading-snug" style={{ color: rightColor ?? 'var(--color-foreground)' }}>
        {right}
      </span>
    </div>
  )
}

function FileList({ title, files, empty }: { title: string; files: string[]; empty: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[9px] uppercase tracking-[0.15em]" style={{ color: 'var(--color-cockpit-dim)' }}>
        {title}
      </p>
      {files.length === 0 ? (
        <p className="text-[10px]" style={{ color: 'var(--color-cockpit-dim)' }}>{empty}</p>
      ) : (
        <ul className="space-y-1">
          {files.slice(0, 6).map((file) => (
            <li key={file} className="truncate text-[10px]" title={file} style={{ color: 'var(--color-foreground)' }}>
              {file}
            </li>
          ))}
          {files.length > 6 && (
            <li className="text-[10px]" style={{ color: 'var(--color-cockpit-dim)' }}>+{files.length - 6} more</li>
          )}
        </ul>
      )}
    </div>
  )
}

// ── Mirrored bar chart for tools ───────────────────────────────
function MirroredToolBars({
  left,
  right,
}: {
  left: SessionStats['toolCalls']
  right: SessionStats['toolCalls']
}) {
  const allTools = Array.from(
    new Set([...left.byTool.map((t) => t.toolName), ...right.byTool.map((t) => t.toolName)])
  ).slice(0, 8)

  if (allTools.length === 0) {
    return (
      <div className="text-center text-[10px] font-mono py-3" style={{ color: 'var(--color-cockpit-dim)' }}>
        no tool calls recorded
      </div>
    )
  }

  const leftMap = new Map(left.byTool.map((t) => [t.toolName, t.count]))
  const rightMap = new Map(right.byTool.map((t) => [t.toolName, t.count]))
  const max = Math.max(...allTools.flatMap((t) => [leftMap.get(t) ?? 0, rightMap.get(t) ?? 0]), 1)

  return (
    <div className="space-y-1.5 py-1">
      {allTools.map((tool) => {
        const l = leftMap.get(tool) ?? 0
        const r = rightMap.get(tool) ?? 0
        const lPct = (l / max) * 100
        const rPct = (r / max) * 100
        return (
          <div key={tool} className="grid items-center gap-2 font-mono text-[10px]" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
            {/* left bar — fills right-to-left */}
            <div className="flex items-center justify-end gap-1.5">
              <span className="tabular-nums w-5 text-right shrink-0" style={{ color: 'var(--color-cockpit-dim)' }}>{l || ''}</span>
              <div className="flex-1 h-2 bg-muted/40 rounded-sm overflow-hidden flex justify-end">
                <div
                  className="h-full rounded-sm transition-all"
                  style={{
                    width: `${lPct}%`,
                    background: l >= r
                      ? 'linear-gradient(to left, var(--color-cockpit-cyan), oklch(0.65 0.18 195 / 0.6))'
                      : 'var(--color-cockpit-dim)',
                  }}
                />
              </div>
            </div>

            {/* center label */}
            <span className="text-center text-[9px] uppercase tracking-wider w-24 shrink-0 truncate" style={{ color: 'var(--color-muted-foreground)' }}>
              {tool}
            </span>

            {/* right bar */}
            <div className="flex items-center gap-1.5">
              <div className="flex-1 h-2 bg-muted/40 rounded-sm overflow-hidden">
                <div
                  className="h-full rounded-sm transition-all"
                  style={{
                    width: `${rPct}%`,
                    background: r >= l
                      ? 'linear-gradient(to right, var(--color-cockpit-cyan), oklch(0.65 0.18 195 / 0.6))'
                      : 'var(--color-cockpit-dim)',
                  }}
                />
              </div>
              <span className="tabular-nums w-5 shrink-0" style={{ color: 'var(--color-cockpit-dim)' }}>{r || ''}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Session identity header ────────────────────────────────────
function SessionHeader({ summary, align }: { summary: SessionSummary; align: 'left' | 'right' }) {
  const pColor = providerColor(summary.provider)
  const sColor = statusColor(summary.finalStatus)
  const title =
    summary.title?.trim() ||
    summary.taskTitle?.trim() ||
    getSessionTitle(summary.workspacePath, summary.sessionId)
  const branch = summary.branch?.trim() || null
  const projectId = summary.projectId?.trim() || null
  const isLeft = align === 'left'

  return (
    <div className={`flex flex-col gap-0.5 ${isLeft ? 'items-start' : 'items-end'}`}>
      <div className={`flex items-center gap-2 ${isLeft ? '' : 'flex-row-reverse'}`}>
        <span
          className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest border"
          style={{ color: pColor, borderColor: pColor }}
        >
          {summary.provider}
        </span>
        <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: sColor }}>
          {summary.finalStatus}
        </span>
      </div>
      <p
        className="font-mono text-sm font-semibold leading-tight truncate max-w-[220px]"
        style={{ color: 'var(--color-foreground)' }}
        title={summary.title?.trim() ? summary.workspacePath : undefined}
      >
        {title}
      </p>
      {(summary.tags ?? []).length > 0 && (
        <div className={`flex max-w-[220px] flex-wrap gap-1 ${isLeft ? '' : 'justify-end'}`}>
          {(summary.tags ?? []).map((tag) => (
            <span
              key={tag}
              className="border border-[var(--color-cockpit-cyan)]/35 px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-cockpit-cyan)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {branch && (
        <span
          className="border border-[var(--color-cockpit-cyan)]/35 px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-cockpit-cyan)]"
          title={`Branch: ${branch}`}
        >
          {branch}
        </span>
      )}
      {projectId && (
        <span
          className="border border-[var(--color-cockpit-cyan)]/35 px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-cockpit-cyan)]"
          title={`Project ID: ${projectId}`}
        >
          {projectId}
        </span>
      )}
      <p className="font-mono text-[10px]" style={{ color: 'var(--color-cockpit-dim)' }}>
        {summary.sessionId.slice(0, 8)}
      </p>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────
export function ComparePanel({ left, right }: { left: SessionSummary; right: SessionSummary }) {
  const leftStats  = useSessionStats(left.sessionId)
  const rightStats = useSessionStats(right.sessionId)
  const leftEvents = useSessionEvents(left.sessionId)
  const rightEvents = useSessionEvents(right.sessionId)
  const [preferred, setPreferred] = useState<'left' | 'right' | null>(null)

  const loading = !leftStats || !rightStats || !leftEvents || !rightEvents

  const leftTitle =
    left.title?.trim() || left.taskTitle?.trim() || getSessionTitle(left.workspacePath, left.sessionId)
  const rightTitle =
    right.title?.trim() || right.taskTitle?.trim() || getSessionTitle(right.workspacePath, right.sessionId)
  const overlap = loading ? { shared: [], leftOnly: [], rightOnly: [] } : fileOverlap(extractChangedFiles(leftEvents), extractChangedFiles(rightEvents))
  const leftTest = loading ? null : deriveTestSignal(leftEvents)
  const rightTest = loading ? null : deriveTestSignal(rightEvents)
  const leftSummary = loading ? '' : deriveSummaryExcerpt(leftEvents)
  const rightSummary = loading ? '' : deriveSummaryExcerpt(rightEvents)

  return (
    <div className="h-full overflow-y-auto font-mono" data-testid="compare-panel">
      {/* ── Header: two identities ── */}
      <div
        className="grid sticky top-0 z-10 border-b border-border/60"
        style={{
          gridTemplateColumns: '1fr auto 1fr',
          background: 'var(--color-panel-surface)',
        }}
      >
        <div className="px-5 py-3 border-r border-border/40">
          <SessionHeader summary={left} align="left" />
        </div>
        <div
          className="flex items-center justify-center px-3"
          style={{ color: 'var(--color-cockpit-dim)' }}
        >
          <span className="text-[10px] tracking-[0.2em] uppercase">vs</span>
        </div>
        <div className="px-5 py-3">
          <SessionHeader summary={right} align="right" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-[11px]" style={{ color: 'var(--color-cockpit-dim)' }}>
          loading…
        </div>
      ) : (
          <div className="px-4 py-3 space-y-1">

          {/* ── Task ── */}
          <SectionDivider label="Task" />
          <div className="py-1 space-y-0.5">
            <TextCompareRow label="Title" left={leftTitle} right={rightTitle} />
          </div>

          {/* ── Tokens ── */}
          <SectionDivider label="Tokens" />
          <div className="py-1 space-y-0.5">
            <MetricRow
              label="Input"
              left={leftStats.tokens.input}
              right={rightStats.tokens.input}
              leftColor="var(--color-cockpit-cyan)"
              rightColor="var(--color-cockpit-cyan)"
            />
            <MetricRow
              label="Output"
              left={leftStats.tokens.output}
              right={rightStats.tokens.output}
              leftColor="var(--color-cockpit-amber)"
              rightColor="var(--color-cockpit-amber)"
            />
            <MetricRow
              label="Cached"
              left={leftStats.tokens.cached}
              right={rightStats.tokens.cached}
              leftColor="var(--color-cockpit-green)"
              rightColor="var(--color-cockpit-green)"
            />
            <MetricRow
              label="Total"
              left={leftStats.tokens.total}
              right={rightStats.tokens.total}
            />
          </div>

          {/* model names */}
          {(leftStats.tokens.model || rightStats.tokens.model) && (
            <div className="grid text-[9px] pb-1" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
              <span className="text-right pr-4" style={{ color: 'var(--color-cockpit-dim)' }}>
                {leftStats.tokens.model ?? '—'}
              </span>
              <span className="w-24 text-center" style={{ color: 'var(--color-cockpit-dim)' }}>model</span>
              <span className="pl-4" style={{ color: 'var(--color-cockpit-dim)' }}>
                {rightStats.tokens.model ?? '—'}
              </span>
            </div>
          )}

          {/* ── File Changes ── */}
          <SectionDivider label="File Changes" />
          <div className="py-1 space-y-0.5">
            <MetricRow
              label="Created"
              left={leftStats.fileChanges.created}
              right={rightStats.fileChanges.created}
              leftColor="var(--color-cockpit-green)"
              rightColor="var(--color-cockpit-green)"
            />
            <MetricRow
              label="Modified"
              left={leftStats.fileChanges.modified}
              right={rightStats.fileChanges.modified}
              leftColor="var(--color-cockpit-amber)"
              rightColor="var(--color-cockpit-amber)"
            />
            <MetricRow
              label="Deleted"
              left={leftStats.fileChanges.deleted}
              right={rightStats.fileChanges.deleted}
              leftColor="var(--color-cockpit-red)"
              rightColor="var(--color-cockpit-red)"
            />
          </div>

          {/* ── Diff Overlap ── */}
          <SectionDivider label="Diff Overlap" />
          <div className="grid gap-3 py-2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <FileList title="Shared" files={overlap.shared} empty="No overlap" />
            <FileList title="Left only" files={overlap.leftOnly} empty="No unique files" />
            <FileList title="Right only" files={overlap.rightOnly} empty="No unique files" />
          </div>

          {/* ── Tests ── */}
          <SectionDivider label="Tests" />
          {leftTest && rightTest && (
            <TextCompareRow
              label="Result"
              left={leftTest.label}
              right={rightTest.label}
              leftColor={leftTest.color}
              rightColor={rightTest.color}
            />
          )}

          {/* ── Summary ── */}
          <SectionDivider label="Summary" />
          <TextCompareRow label="Output" left={leftSummary} right={rightSummary} />

          {/* ── Approvals ── */}
          <SectionDivider label="Approvals" />
          <div className="py-1 space-y-0.5">
            <MetricRow
              label="Approved"
              left={leftStats.approvals.approved}
              right={rightStats.approvals.approved}
              leftColor="var(--color-cockpit-green)"
              rightColor="var(--color-cockpit-green)"
            />
            <MetricRow
              label="Denied"
              left={leftStats.approvals.denied}
              right={rightStats.approvals.denied}
              leftColor="var(--color-cockpit-red)"
              rightColor="var(--color-cockpit-red)"
            />
          </div>

          {/* ── Tool Calls ── */}
          <SectionDivider label="Tool Calls" />
          <div className="py-1">
            <div className="grid text-[10px] mb-2" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
              <span
                className="text-right pr-4 text-base font-semibold tabular-nums"
                style={{ color: 'var(--color-foreground)' }}
              >
                {fmt(leftStats.toolCalls.total)}
              </span>
              <span className="w-24 text-center text-[9px] uppercase tracking-wider" style={{ color: 'var(--color-cockpit-dim)' }}>total</span>
              <span
                className="pl-4 text-base font-semibold tabular-nums"
                style={{ color: 'var(--color-foreground)' }}
              >
                {fmt(rightStats.toolCalls.total)}
              </span>
            </div>
            <MirroredToolBars left={leftStats.toolCalls} right={rightStats.toolCalls} />
          </div>

          {/* ── Meta ── */}
          <SectionDivider label="Meta" />
          <div className="py-1 pb-4 space-y-0.5">
            <MetricRow
              label="Duration"
              left={fmtDuration(leftStats.duration)}
              right={fmtDuration(rightStats.duration)}
            />
            <MetricRow
              label="Subagents"
              left={leftStats.subagentSpawns}
              right={rightStats.subagentSpawns}
              leftColor="var(--color-cockpit-cyan)"
              rightColor="var(--color-cockpit-cyan)"
            />
            <TextCompareRow
              label="Relations"
              left={relationLabel(left)}
              right={relationLabel(right)}
              leftColor="var(--color-cockpit-amber)"
              rightColor="var(--color-cockpit-amber)"
            />
          </div>

          {/* ── Decision ── */}
          <SectionDivider label="Decision" />
          <div className="grid items-center gap-3 py-2 pb-5" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
            <button
              type="button"
              onClick={() => setPreferred(preferred === 'left' ? null : 'left')}
              className="justify-self-end border px-3 py-1 text-[10px] uppercase tracking-[0.15em]"
              style={{
                color: preferred === 'left' ? 'var(--color-cockpit-green)' : 'var(--color-cockpit-dim)',
                borderColor: preferred === 'left' ? 'var(--color-cockpit-green)' : 'var(--color-border)',
              }}
            >
              Prefer left
            </button>
            <span className="w-24 text-center text-[9px] uppercase tracking-[0.15em]" style={{ color: 'var(--color-cockpit-dim)' }}>
              {preferred ? `Preferred ${preferred}` : 'No pick'}
            </span>
            <button
              type="button"
              onClick={() => setPreferred(preferred === 'right' ? null : 'right')}
              className="justify-self-start border px-3 py-1 text-[10px] uppercase tracking-[0.15em]"
              style={{
                color: preferred === 'right' ? 'var(--color-cockpit-green)' : 'var(--color-cockpit-dim)',
                borderColor: preferred === 'right' ? 'var(--color-cockpit-green)' : 'var(--color-border)',
              }}
            >
              Prefer right
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
