import { useEffect, useMemo, useState } from 'react'
import { useStore, type SessionSummary } from '../store/index.js'
import { ComparePanel } from '../components/panels/ComparePanel.js'
import { DAEMON_URL } from '../lib/daemonUrl.js'

type ProviderFilter = 'all' | string
type StatusFilter = 'all' | 'active' | 'ended' | 'error'
type DateFilter = 'all' | '7d' | '30d'

interface HistoryPageProps {
  onSessionOpen?: () => void
}

export function HistoryPage({ onSessionOpen }: HistoryPageProps) {
  const { historySessions, bulkApplySessions, setHistoryMode, compareSelectionIds, toggleCompareSelection, selectSession, setSessionDetailOpen } = useStore()
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')

  useEffect(() => {
    fetch(`${DAEMON_URL}/api/sessions`)
      .then((r) => r.json())
      .then((sessions: SessionSummary[]) => bulkApplySessions(sessions))
      .catch(() => {})
  }, [bulkApplySessions])

  const sessions = Object.values(historySessions).sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  )

  // Derive unique workspace paths for the project filter select
  const uniqueProjects = useMemo(
    () => Array.from(new Set(sessions.map((s) => s.workspacePath))).sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions.length],
  )

  const filtered = sessions.filter((s) => {
    if (providerFilter !== 'all' && s.provider !== providerFilter) return false
    if (statusFilter !== 'all' && s.finalStatus !== statusFilter) return false
    if (projectFilter !== 'all' && s.workspacePath !== projectFilter) return false
    if (dateFilter !== 'all') {
      const cutoffDays = dateFilter === '7d' ? 7 : 30
      const cutoff = Date.now() - cutoffDays * 24 * 60 * 60 * 1000
      if (new Date(s.startedAt).getTime() < cutoff) return false
    }
    return true
  })

  const compareLeft = compareSelectionIds[0] ? historySessions[compareSelectionIds[0]] : null
  const compareRight = compareSelectionIds[1] ? historySessions[compareSelectionIds[1]] : null

  function openSession(sessionId: string) {
    setHistoryMode(true)
    selectSession(sessionId)
    setSessionDetailOpen(true)
    onSessionOpen?.()
  }

  const selectClass =
    'rounded-none border border-[var(--color-cockpit-cyan)]/30 bg-[var(--color-panel-surface)] px-2 py-1 text-[10px] [font-family:var(--font-mono-data)] uppercase tracking-wide text-foreground focus:outline-none focus:border-[var(--color-cockpit-cyan)]/60'

  return (
    <div className="flex flex-col h-full" data-testid="history-page">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 bg-[var(--color-panel-surface)]">
        <h2 className="cockpit-label">Session Archive</h2>

        {/* Provider filter */}
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className={selectClass}
          data-testid="provider-filter"
        >
          <option value="all">All providers</option>
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className={selectClass}
          data-testid="status-filter"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="ended">Ended</option>
          <option value="error">Error</option>
        </select>

        {/* Project filter */}
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className={selectClass}
          data-testid="project-filter"
        >
          <option value="all">All projects</option>
          {uniqueProjects.map((p) => (
            <option key={p} value={p}>
              {p.split('/').pop() ?? p}
            </option>
          ))}
        </select>

        {/* Date recency filter */}
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as DateFilter)}
          className={selectClass}
          data-testid="date-filter"
        >
          <option value="all">All time</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>

        {compareSelectionIds.length === 2 && (
          <button
            onClick={() => {
              toggleCompareSelection(compareSelectionIds[0]!)
              toggleCompareSelection(compareSelectionIds[1]!)
            }}
            className="ml-auto cockpit-btn"
            data-testid="clear-comparison"
          >
            Clear compare
          </button>
        )}
      </header>

      {compareLeft && compareRight && (
        <div className="border-b border-border" data-testid="compare-container">
          <ComparePanel left={compareLeft} right={compareRight} />
        </div>
      )}

      <ul className="flex-1 overflow-auto" data-testid="history-session-list">
        {filtered.map((s) => {
          const statusColor =
            s.finalStatus === 'active' ? 'var(--color-cockpit-green)' :
            s.finalStatus === 'error' ? 'var(--color-cockpit-red)' :
            'var(--color-cockpit-dim)'
          return (
            <li
              key={s.sessionId}
              className="flex items-center gap-3 border-b border-border/50 px-4 py-2 hover:bg-[var(--color-panel-surface)] cursor-pointer group"
              data-testid={`session-row-${s.sessionId}`}
            >
              <input
                type="checkbox"
                checked={compareSelectionIds.includes(s.sessionId)}
                onChange={() => toggleCompareSelection(s.sessionId)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select ${s.sessionId} for comparison`}
                data-testid={`compare-checkbox-${s.sessionId}`}
                className="accent-[var(--color-cockpit-cyan)]"
              />
              <button
                className="flex flex-1 items-center gap-3 text-left"
                onClick={() => openSession(s.sessionId)}
              >
                <span className="data-readout text-[10px] tabular-nums w-16 shrink-0">{s.sessionId.slice(0, 8)}</span>
                <span className={`shrink-0 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${s.provider === 'claude' ? 'badge-provider-claude' : 'badge-provider-codex'}`}>
                  {s.provider}
                </span>
                <span className="flex-1 truncate [font-family:var(--font-mono-data)] text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">
                  {s.workspacePath}
                </span>
                <span className="[font-family:var(--font-mono-data)] text-[10px] uppercase tracking-wide shrink-0" style={{ color: statusColor }}>
                  {s.finalStatus}
                </span>
                <span className="data-readout-dim text-[10px] tabular-nums shrink-0">
                  {new Date(s.startedAt).toLocaleDateString()}
                </span>
              </button>
            </li>
          )
        })}
        {filtered.length === 0 && (
          <li className="px-4 py-8 text-center cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }} data-testid="history-empty">
            -- NO SESSIONS FOUND --
          </li>
        )}
      </ul>
    </div>
  )
}
