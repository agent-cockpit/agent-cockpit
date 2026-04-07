import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useStore, type SessionSummary } from '../store/index.js'
import { ComparePanel } from '../components/panels/ComparePanel.js'

const DAEMON_URL = 'http://localhost:3001'
type ProviderFilter = 'all' | string
type StatusFilter = 'all' | 'active' | 'ended' | 'error'
type DateFilter = 'all' | '7d' | '30d'

export function HistoryPage() {
  const navigate = useNavigate()
  const { historySessions, bulkApplySessions, setHistoryMode, compareSelectionIds, toggleCompareSelection } = useStore()
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

  const sessions = Object.values(historySessions)

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
    navigate(`/session/${sessionId}/timeline`)
  }

  return (
    <div className="flex flex-col h-full" data-testid="history-page">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold">Session History</h2>

        {/* Provider filter */}
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1 text-xs"
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
          className="rounded border border-border bg-background px-2 py-1 text-xs"
          data-testid="status-filter"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="ended">Ended</option>
          <option value="error">Error</option>
        </select>

        {/* Project filter — derived from unique workspacePaths in loaded sessions */}
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1 text-xs"
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
          className="rounded border border-border bg-background px-2 py-1 text-xs"
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
            className="ml-auto text-xs underline"
            data-testid="clear-comparison"
          >
            Clear comparison
          </button>
        )}
      </header>

      {compareLeft && compareRight && (
        <div className="border-b border-border" data-testid="compare-container">
          <ComparePanel left={compareLeft} right={compareRight} />
        </div>
      )}

      <ul className="flex-1 overflow-auto" data-testid="history-session-list">
        {filtered.map((s) => (
          <li
            key={s.sessionId}
            className="flex items-center gap-3 border-b border-border px-4 py-2 hover:bg-muted/50 cursor-pointer"
            data-testid={`session-row-${s.sessionId}`}
          >
            <input
              type="checkbox"
              checked={compareSelectionIds.includes(s.sessionId)}
              onChange={() => toggleCompareSelection(s.sessionId)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select ${s.sessionId} for comparison`}
              data-testid={`compare-checkbox-${s.sessionId}`}
            />
            <button
              className="flex flex-1 items-center gap-3 text-left text-sm"
              onClick={() => openSession(s.sessionId)}
            >
              <span className="font-mono text-xs text-muted-foreground">{s.sessionId.slice(0, 8)}</span>
              <span className="rounded bg-muted px-1 text-xs">{s.provider}</span>
              <span className="flex-1 truncate text-xs text-muted-foreground">{s.workspacePath}</span>
              <span className="text-xs">{s.finalStatus}</span>
              <span className="text-xs text-muted-foreground">{new Date(s.startedAt).toLocaleDateString()}</span>
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground" data-testid="history-empty">
            No sessions found
          </li>
        )}
      </ul>
    </div>
  )
}
