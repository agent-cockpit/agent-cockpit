import { useEffect, useMemo, useState } from 'react'
import { ComparePanel } from '../components/panels/ComparePanel.js'
import { DAEMON_URL } from '../lib/daemonUrl.js'
import { getSessionTitle } from '../lib/sessionTitle.js'
import { useStore, type SessionSummary } from '../store/index.js'

type ProviderFilter = 'all' | string
type StatusFilter = 'all' | 'active' | 'ended' | 'error'
type DateFilter = 'all' | '7d' | '30d'
type SearchStatus = 'idle' | 'loading' | 'loaded' | 'error'

interface SearchResult {
  sourceType: 'event' | 'approval' | 'memory_note' | 'session_metadata'
  sourceId: string
  sessionId: string
  snippet: string
  eventType?: string
  filePath?: string
  title?: string
  timestamp?: string
}

interface HistoryPageProps {
  onSessionOpen?: () => void
}

export function HistoryPage({ onSessionOpen }: HistoryPageProps) {
  const {
    historySessions,
    bulkApplySessions,
    updateHistorySessionLabels,
    removeHistorySessions,
    setHistoryMode,
    compareSelectionIds,
    toggleCompareSelection,
    openSessionPopup,
  } = useStore()
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [deleteSelectionIds, setDeleteSelectionIds] = useState<string[]>([])
  const [deleteTargets, setDeleteTargets] = useState<string[]>([])
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle')
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [tagsDraft, setTagsDraft] = useState('')
  const [labelError, setLabelError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${DAEMON_URL}/api/sessions`)
      .then((r) => r.json())
      .then((sessions: SessionSummary[]) => bulkApplySessions(sessions))
      .catch(() => {})
  }, [bulkApplySessions])

  useEffect(() => {
    const query = searchQuery.trim()
    if (!query) {
      setSearchResults([])
      setSearchStatus('idle')
      return
    }

    let cancelled = false
    setSearchStatus('loading')
    const timer = setTimeout(() => {
      fetch(`${DAEMON_URL}/api/search?q=${encodeURIComponent(query)}`)
        .then((r) => {
          if (!r.ok) throw new Error('search failed')
          return r.json() as Promise<SearchResult[]>
        })
        .then((results) => {
          if (cancelled) return
          setSearchResults(results)
          setSearchStatus('loaded')
        })
        .catch(() => {
          if (cancelled) return
          setSearchResults([])
          setSearchStatus('error')
        })
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchQuery])

  const sessions = Object.values(historySessions).sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  )

  // Derive unique workspace paths for the project filter select
  const uniqueProjects = useMemo(
    () => Array.from(new Set(sessions.map((s) => s.workspacePath))).sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions.length],
  )

  const uniqueTags = useMemo(
    () => Array.from(new Set(sessions.flatMap((s) => s.tags ?? []))).sort(),
    [sessions],
  )

  const filtered = sessions.filter((s) => {
    if (providerFilter !== 'all' && s.provider !== providerFilter) return false
    if (statusFilter !== 'all' && s.finalStatus !== statusFilter) return false
    if (projectFilter !== 'all' && s.workspacePath !== projectFilter) return false
    if (tagFilter !== 'all' && !(s.tags ?? []).includes(tagFilter)) return false
    if (dateFilter !== 'all') {
      const cutoffDays = dateFilter === '7d' ? 7 : 30
      const cutoff = Date.now() - cutoffDays * 24 * 60 * 60 * 1000
      if (new Date(s.startedAt).getTime() < cutoff) return false
    }
    return true
  })

  const compareLeft = compareSelectionIds[0] ? historySessions[compareSelectionIds[0]] : null
  const compareRight = compareSelectionIds[1] ? historySessions[compareSelectionIds[1]] : null

  const selectedSet = useMemo(() => new Set(deleteSelectionIds), [deleteSelectionIds])

  const activeDeleteTargets = useMemo(
    () => deleteTargets.map((id) => historySessions[id]).filter((s): s is SessionSummary => !!s && s.finalStatus === 'active'),
    [deleteTargets, historySessions],
  )

  const nonTerminableActiveTargets = useMemo(
    () => activeDeleteTargets.filter((s) => s.capabilities?.canTerminateSession === false),
    [activeDeleteTargets],
  )

  const canConfirmDelete = !isDeleting && deleteTargets.length > 0 && nonTerminableActiveTargets.length === 0
  const canCompare = deleteSelectionIds.length === 2
  const isCompareOpen = compareSelectionIds.length === 2 && !!compareLeft && !!compareRight

  useEffect(() => {
    // Keep selection in sync after refreshes/deletions.
    setDeleteSelectionIds((current) => current.filter((id) => !!historySessions[id]))
  }, [historySessions])

  function openSession(sessionId: string) {
    setHistoryMode(true)
    openSessionPopup(sessionId, { preferredTab: 'timeline' })
    onSessionOpen?.()
  }

  function panelForSearchResult(result: SearchResult) {
    if (result.sourceType === 'session_metadata') return 'timeline' as const
    if (result.sourceType === 'approval' || result.eventType === 'approval_request') return 'approvals' as const
    if (result.sourceType === 'memory_note' || result.eventType === 'memory_write' || result.eventType === 'memory_read') return 'memory' as const
    if (result.eventType === 'file_change') return 'diff' as const
    return 'timeline' as const
  }

  function openSearchResult(result: SearchResult): void {
    setHistoryMode(true)
    openSessionPopup(result.sessionId, { preferredTab: panelForSearchResult(result) })
    onSessionOpen?.()
  }

  function toggleDeleteSelection(sessionId: string): void {
    setDeleteSelectionIds((current) => {
      if (current.includes(sessionId)) {
        return current.filter((id) => id !== sessionId)
      }
      return [...current, sessionId]
    })
  }

  function startEditingLabels(session: SessionSummary): void {
    setEditingSessionId(session.sessionId)
    setTitleDraft(session.title ?? '')
    setTagsDraft((session.tags ?? []).join(', '))
    setLabelError(null)
  }

  function parseTagDraft(raw: string): string[] {
    return Array.from(
      new Set(
        raw
          .split(',')
          .map((tag) => tag.trim().replace(/\s+/g, '-').toLowerCase())
          .filter(Boolean),
      ),
    )
  }

  async function saveLabels(sessionId: string): Promise<void> {
    const labels = {
      title: titleDraft.trim(),
      tags: parseTagDraft(tagsDraft),
    }

    setLabelError(null)
    try {
      const response = await fetch(`${DAEMON_URL}/api/sessions/${encodeURIComponent(sessionId)}/labels`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(labels),
      })
      if (!response.ok) throw new Error('Failed to update labels.')
      const saved = await response.json() as { title: string; tags: string[] }
      updateHistorySessionLabels(sessionId, saved)
      setEditingSessionId(null)
    } catch (error) {
      setLabelError(error instanceof Error ? error.message : 'Failed to update labels.')
    }
  }

  function applyCompareSelection(nextIds: string[]): void {
    compareSelectionIds.forEach((id) => toggleCompareSelection(id))
    nextIds.forEach((id) => toggleCompareSelection(id))
  }

  function handleCompareAction(): void {
    if (isCompareOpen) {
      compareSelectionIds.forEach((id) => toggleCompareSelection(id))
      return
    }
    if (!canCompare) return
    applyCompareSelection(deleteSelectionIds)
  }

  function requestDeleteSelected(): void {
    if (deleteSelectionIds.length === 0) return
    setDeleteError(null)
    setDeleteTargets(deleteSelectionIds)
    setIsDeleteDialogOpen(true)
  }

  function requestDeleteAll(): void {
    if (sessions.length === 0) return
    setDeleteError(null)
    setDeleteTargets(sessions.map((s) => s.sessionId))
    setIsDeleteDialogOpen(true)
  }

  function closeDeleteDialog(): void {
    if (isDeleting) return
    setIsDeleteDialogOpen(false)
    setDeleteTargets([])
  }

  async function confirmDelete(): Promise<void> {
    if (!canConfirmDelete) return

    setDeleteError(null)
    setIsDeleting(true)
    try {
      const terminateActive = activeDeleteTargets.length > 0
      const response = await fetch(`${DAEMON_URL}/api/sessions`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionIds: deleteTargets,
          terminateActive,
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | { deletedSessionIds?: string[]; skipped?: Array<{ reason?: string }> }
        | null

      if (!response.ok) {
        const skippedReason = payload?.skipped?.[0]?.reason
        throw new Error(skippedReason || 'Failed to delete sessions.')
      }

      const deletedSessionIds = payload?.deletedSessionIds ?? []
      if (deletedSessionIds.length > 0) {
        removeHistorySessions(deletedSessionIds)
      }

      setDeleteSelectionIds((current) => current.filter((id) => !deletedSessionIds.includes(id)))

      if ((payload?.skipped?.length ?? 0) > 0) {
        const firstReason = payload?.skipped?.[0]?.reason ?? 'Some sessions could not be deleted.'
        setDeleteError(firstReason)
      } else {
        setIsDeleteDialogOpen(false)
        setDeleteTargets([])
      }
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete sessions.')
    } finally {
      setIsDeleting(false)
    }
  }

  const selectClass =
    'rounded-none border border-[var(--color-cockpit-cyan)]/30 bg-[var(--color-panel-surface)] px-2 py-1 text-[10px] [font-family:var(--font-mono-data)] uppercase tracking-wide text-foreground focus:outline-none focus:border-[var(--color-cockpit-cyan)]/60'

  const groupedSearchResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {}
    for (const result of searchResults) {
      const key =
        result.sourceType === 'memory_note' ? 'Memory' :
        result.sourceType === 'session_metadata' ? 'Session Labels' :
        result.sourceType === 'approval' || result.eventType === 'approval_request' ? 'Approvals' :
        result.eventType === 'file_change' ? 'File Changes' :
        'Events'
      groups[key] = [...(groups[key] ?? []), result]
    }
    return Object.entries(groups)
  }, [searchResults])

  function renderSnippet(snippet: string) {
    return {
      __html: snippet
        .replace(/<b>/g, '<mark>')
        .replace(/<\/b>/g, '</mark>')
        .replace(/<(?!\/?mark)[^>]+>/g, ''),
    }
  }

  return (
    <div className="flex flex-col h-full" data-testid="history-page">
      <header className="border-b border-border bg-[var(--color-panel-surface)] px-4 py-2">
        <div className="flex flex-wrap items-center gap-3" data-testid="history-actions-row">
          <h2 className="cockpit-label">Actions</h2>

          <button
            type="button"
            onClick={handleCompareAction}
            className="cockpit-btn disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canCompare && !isCompareOpen}
            data-testid="compare-action"
          >
            {isCompareOpen ? 'Close compare' : 'Compare'}
          </button>

          <button
            type="button"
            onClick={requestDeleteSelected}
            className="cockpit-btn border-red-500/60 text-red-300 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={deleteSelectionIds.length === 0}
            data-testid="delete-selected"
          >
            Delete selected ({deleteSelectionIds.length})
          </button>

          <button
            type="button"
            onClick={requestDeleteAll}
            className="cockpit-btn border-red-500/60 text-red-300 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={sessions.length === 0}
            data-testid="delete-all"
          >
            Delete all
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3" data-testid="history-filters-row">
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search sessions, tags, files, approvals, memory..."
            aria-label="Search sessions, tags, files, approvals, and memory"
            className="min-w-64 flex-1 rounded-none border border-[var(--color-cockpit-cyan)]/30 bg-background px-2 py-1 text-[10px] [font-family:var(--font-mono-data)] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[var(--color-cockpit-cyan)]/60"
            data-testid="history-search-input"
          />
          {/* Provider filter */}
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          aria-label="Filter history by provider"
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
          aria-label="Filter history by status"
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
          aria-label="Filter history by project"
          className={selectClass}
          data-testid="project-filter"
        >
          <option value="all">All projects</option>
          {uniqueProjects.map((p) => (
            <option key={p} value={p}>
              {getSessionTitle(p)}
            </option>
          ))}
        </select>

        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          aria-label="Filter history by tag"
          className={selectClass}
          data-testid="tag-filter"
        >
          <option value="all">All tags</option>
          {uniqueTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>

        {/* Date recency filter */}
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as DateFilter)}
          aria-label="Filter history by date"
          className={selectClass}
          data-testid="date-filter"
        >
          <option value="all">All time</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>

        </div>
      </header>

      {searchQuery.trim() && (
        <section className="border-b border-border bg-background/70" data-testid="history-search-results">
          <div className="px-4 py-2">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="cockpit-label">Search Results</h2>
              <span className="data-readout-dim text-[10px]">
                {searchStatus === 'loading' ? 'searching' : `${searchResults.length} found`}
              </span>
            </div>
            {searchStatus === 'error' && (
              <div className="py-3 text-xs [font-family:var(--font-mono-data)] text-red-300" data-testid="history-search-error">
                Search failed.
              </div>
            )}
            {searchStatus === 'loaded' && searchResults.length === 0 && (
              <div className="py-3 text-center cockpit-label text-muted-foreground" data-testid="history-search-empty">
                -- NO SEARCH RESULTS --
              </div>
            )}
            {groupedSearchResults.length > 0 && (
              <div className="grid gap-2 md:grid-cols-2">
                {groupedSearchResults.map(([group, results]) => (
                  <div key={group} className="border border-border/60 bg-[var(--color-panel-surface)]">
                    <div className="border-b border-border/50 px-3 py-1 cockpit-label">{group}</div>
                    <ul>
                      {results.map((result) => (
                        <li key={`${result.sourceType}:${result.sourceId}:${result.sessionId}`} className="border-b border-border/35 last:border-b-0">
                          <button
                            type="button"
                            onClick={() => openSearchResult(result)}
                            className="block w-full px-3 py-2 text-left hover:bg-muted/25"
                            data-testid="history-search-result"
                          >
                            <div className="flex items-center gap-2">
                              <span className="data-readout text-[10px]">{result.sessionId.slice(0, 8)}</span>
                              <span className="[font-family:var(--font-mono-data)] text-[10px] uppercase tracking-wide text-foreground">
                                {result.title ?? result.eventType ?? result.sourceType}
                              </span>
                            </div>
                            <div
                              className="mt-1 text-xs text-muted-foreground"
                              dangerouslySetInnerHTML={renderSnippet(result.snippet)}
                            />
                            {result.filePath && (
                              <div className="mt-1 data-readout-dim text-[9px] truncate">{result.filePath}</div>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

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
          const displayTitle =
            s.title?.trim() ||
            s.taskTitle?.trim() ||
            getSessionTitle(s.workspacePath, s.sessionId)
          const branch = s.branch?.trim() || null
          const projectId = s.projectId?.trim() || null
          const parentSessionId = s.parentSessionId ?? null
          const childCount = (s.childSessionIds ?? []).length
          const isEditingLabels = editingSessionId === s.sessionId
          return (
            <li
              key={s.sessionId}
              className="border-b border-border/50 px-4 py-2 hover:bg-[var(--color-panel-surface)] group"
              data-testid={`session-row-${s.sessionId}`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedSet.has(s.sessionId)}
                  onChange={() => toggleDeleteSelection(s.sessionId)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${s.sessionId} for actions`}
                  data-testid={`selection-checkbox-${s.sessionId}`}
                  className="accent-[var(--color-cockpit-red)]"
                />
                <button
                  className="flex flex-1 items-center gap-3 text-left"
                  onClick={() => openSession(s.sessionId)}
                  aria-label={`Open ${displayTitle} session popup on timeline. Status: ${s.finalStatus}. Provider: ${s.provider}.`}
                >
                  <span className="data-readout text-[10px] tabular-nums w-16 shrink-0">{s.sessionId.slice(0, 8)}</span>
                  <span className={`shrink-0 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${s.provider === 'claude' ? 'badge-provider-claude' : 'badge-provider-codex'}`}>
                    {s.provider}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate [font-family:var(--font-mono-data)] text-[10px] font-semibold uppercase tracking-wide text-foreground">
                      {displayTitle}
                    </span>
                    <span className="block truncate [font-family:var(--font-mono-data)] text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">
                      {s.workspacePath}
                    </span>
                    {branch && (
                      <span
                        data-testid={`session-branch-${s.sessionId}`}
                        className="mt-1 inline-block border border-[var(--color-cockpit-cyan)]/35 px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-cockpit-cyan)]"
                        title={`Branch: ${branch}`}
                      >
                        {branch}
                      </span>
                    )}
                    {projectId && (
                      <span
                        data-testid={`session-project-${s.sessionId}`}
                        className="mt-1 inline-block border border-[var(--color-cockpit-cyan)]/35 px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-cockpit-cyan)]"
                        title={`Project ID: ${projectId}`}
                      >
                        {projectId}
                      </span>
                    )}
                    {(parentSessionId || childCount > 0) && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {parentSessionId && (
                          <span
                            data-testid={`session-parent-${s.sessionId}`}
                            className="border border-[var(--color-cockpit-amber)]/45 px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-cockpit-amber)]"
                            title={`Parent session: ${parentSessionId}`}
                          >
                            parent {parentSessionId.slice(0, 8)}
                          </span>
                        )}
                        {childCount > 0 && (
                          <span
                            data-testid={`session-children-${s.sessionId}`}
                            className="border border-[var(--color-cockpit-amber)]/45 px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-cockpit-amber)]"
                            title={`${childCount} child session${childCount === 1 ? '' : 's'}`}
                          >
                            {childCount} child{childCount === 1 ? '' : 'ren'}
                          </span>
                        )}
                      </span>
                    )}
                    {(s.tags ?? []).length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {(s.tags ?? []).map((tag) => (
                          <span
                            key={tag}
                            className="border border-[var(--color-cockpit-cyan)]/35 px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-cockpit-cyan)]"
                          >
                            {tag}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="[font-family:var(--font-mono-data)] text-[10px] uppercase tracking-wide shrink-0" style={{ color: statusColor }}>
                    {s.finalStatus}
                  </span>
                  <span className="data-readout-dim text-[10px] tabular-nums shrink-0">
                    {new Date(s.startedAt).toLocaleDateString()}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => startEditingLabels(s)}
                  className="cockpit-btn py-1 text-[9px]"
                  data-testid={`edit-labels-${s.sessionId}`}
                  aria-label={`Edit labels for ${displayTitle}`}
                >
                  Labels
                </button>
              </div>
              {isEditingLabels && (
                <div
                  className="mt-2 border border-[var(--color-cockpit-cyan)]/45 bg-background/70 p-3"
                  data-testid="session-label-editor"
                >
                  <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
                    <input
                      value={titleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      placeholder="Session title"
                      className="rounded-none border border-border bg-background px-2 py-1 text-xs [font-family:var(--font-mono-data)]"
                      data-testid="session-title-input"
                    />
                    <input
                      value={tagsDraft}
                      onChange={(event) => setTagsDraft(event.target.value)}
                      placeholder="tags, comma-separated"
                      className="rounded-none border border-border bg-background px-2 py-1 text-xs [font-family:var(--font-mono-data)]"
                      data-testid="session-tags-input"
                    />
                    <button
                      type="button"
                      onClick={() => void saveLabels(s.sessionId)}
                      className="cockpit-btn"
                      data-testid="save-session-labels"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSessionId(null)}
                      className="cockpit-btn"
                    >
                      Cancel
                    </button>
                  </div>
                  {labelError && (
                    <p className="mt-2 text-[10px] [font-family:var(--font-mono-data)] text-red-300">
                      {labelError}
                    </p>
                  )}
                </div>
              )}
            </li>
          )
        })}
        {filtered.length === 0 && (
          <li className="px-4 py-8 text-center cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }} data-testid="history-empty">
            -- NO SESSIONS FOUND --
          </li>
        )}
      </ul>

      {isDeleteDialogOpen && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(16,28,40,0.72),rgba(3,8,17,0.9))] px-4 backdrop-blur-[1px]"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="history-delete-dialog-title"
          aria-describedby="history-delete-dialog-description"
          data-testid="delete-history-dialog"
        >
          <div className="cockpit-frame-full w-full max-w-lg rounded-none border border-red-500/55 bg-[var(--color-panel-surface)] shadow-[0_0_24px_rgba(239,68,68,0.28),0_14px_46px_rgba(0,0,0,0.7)]">
            <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
            <span className="cockpit-corner cockpit-corner-tr" aria-hidden />
            <span className="cockpit-corner cockpit-corner-bl" aria-hidden />
            <span className="cockpit-corner cockpit-corner-br" aria-hidden />

            <div className="flex items-center gap-2 border-b border-red-500/35 px-4 py-3">
              <p
                id="history-delete-dialog-title"
                className="[font-family:var(--font-mono-data)] text-[11px] font-semibold uppercase tracking-[0.18em] text-red-300"
              >
                Confirm Session Deletion
              </p>
            </div>

            <div className="space-y-3 px-4 py-4">
              <p
                id="history-delete-dialog-description"
                className="[font-family:var(--font-mono-data)] text-xs text-foreground"
              >
                Delete {deleteTargets.length} selected session(s)?
              </p>
              {activeDeleteTargets.length > 0 && (
                <p className="[font-family:var(--font-mono-data)] text-[11px] text-yellow-300" data-testid="delete-active-warning">
                  {activeDeleteTargets.length} active session(s) will be terminated before deletion. Continue?
                </p>
              )}
              {nonTerminableActiveTargets.length > 0 && (
                <p className="[font-family:var(--font-mono-data)] text-[11px] text-red-300" data-testid="delete-active-blocked-warning">
                  {nonTerminableActiveTargets.length} active session(s) cannot be terminated by daemon and cannot be deleted.
                </p>
              )}
              {deleteError && (
                <p className="[font-family:var(--font-mono-data)] text-[11px] text-red-300" data-testid="delete-history-error">
                  {deleteError}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border/60 px-4 py-3">
              <button
                type="button"
                onClick={closeDeleteDialog}
                disabled={isDeleting}
                className="cockpit-btn min-w-24 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={!canConfirmDelete}
                className="cockpit-btn min-w-40 border-red-500/70 text-red-300 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="confirm-delete-history"
              >
                {isDeleting ? 'Deleting...' : 'Delete sessions'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
