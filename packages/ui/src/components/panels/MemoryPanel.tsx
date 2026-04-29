import { useState, useEffect, useMemo, useRef } from 'react'
import type { NormalizedEvent } from '@agentcockpit/shared'
import { useSearchParams } from 'react-router'
import { useStore } from '../../store/index.js'
import { getSessionEvents, EMPTY_EVENTS } from '../../store/eventsSlice.js'
import { DAEMON_URL as DAEMON } from '../../lib/daemonUrl.js'
import { usePanelSessionId } from './sessionScope.js'

type MemoryNoteCategory = 'commands' | 'architecture' | 'gotchas' | 'conventions' | 'other'
type MemoryNoteScope = 'shared' | 'local'

const NOTE_CATEGORIES: MemoryNoteCategory[] = ['commands', 'architecture', 'gotchas', 'conventions', 'other']

interface MemoryNote {
  note_id: string
  workspace: string
  content: string
  pinned: number
  created_at: string
  category: MemoryNoteCategory
  scope: MemoryNoteScope
}

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

export function MemoryPanel() {
  const sessionId = usePanelSessionId()
  const [searchParams, setSearchParams] = useSearchParams()
  const liveSession = useStore((s) => s.sessions[sessionId ?? ''])
  const historySession = useStore((s) => s.historySessions[sessionId ?? ''])
  const events = useStore((s) => getSessionEvents(s, sessionId ?? ''))
  const bulkApplyEvents = useStore((s) => s.bulkApplyEvents)
  const historyMode = useStore((s) => s.historyMode)

  // CLAUDE.md state
  const [claudeMd, setClaudeMd] = useState<string | null>(null)
  const [claudeMdPath, setClaudeMdPath] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [claudeMdLoaded, setClaudeMdLoaded] = useState(false)

  // Auto memory state
  const [autoMemory, setAutoMemory] = useState<string | null>(null)
  const [agentsMd, setAgentsMd] = useState<string | null>(null)
  const [memorySearchQuery, setMemorySearchQuery] = useState('')
  const [memorySearchResults, setMemorySearchResults] = useState<SearchResult[]>([])
  const [memorySearchStatus, setMemorySearchStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')

  // Notes state
  const [notes, setNotes] = useState<MemoryNote[]>([])
  const [showNewNoteForm, setShowNewNoteForm] = useState(false)
  const [newNoteText, setNewNoteText] = useState('')
  const [newNoteCategory, setNewNoteCategory] = useState<MemoryNoteCategory>('other')
  const [newNoteScope, setNewNoteScope] = useState<MemoryNoteScope>('local')
  const [categoryFilter, setCategoryFilter] = useState<MemoryNoteCategory | 'all'>('all')

  // Dismissed suggestion IDs
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  const sessionStatus = liveSession?.status ?? historySession?.finalStatus
  const showActiveWarning = !historyMode && sessionStatus === 'active'
  const workspace = liveSession?.workspacePath ?? historySession?.workspacePath ?? ''
  const noteRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const notesById = useMemo(() => new Map(notes.map((note) => [note.note_id, note])), [notes])

  // Hydrate session events for pending suggestions if local cache is empty.
  useEffect(() => {
    if (!sessionId) return
    if (events.length > 0) return
    fetch(`${DAEMON}/api/sessions/${sessionId}/events`)
      .then((r) => r.json())
      .then((evs: unknown) => {
        bulkApplyEvents(sessionId, Array.isArray(evs) ? (evs as NormalizedEvent[]) : [])
      })
      .catch(() => {
        /* ignore fetch failures and keep live stream data */
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    const nextQuery = searchParams.get('q') ?? ''
    setMemorySearchQuery((current) => (current === nextQuery ? current : nextQuery))
  }, [searchParams])

  useEffect(() => {
    const query = memorySearchQuery.trim()
    if (!query) {
      setMemorySearchResults([])
      setMemorySearchStatus('idle')
      return
    }

    let cancelled = false
    setMemorySearchStatus('loading')
    const timer = window.setTimeout(() => {
      fetch(`${DAEMON}/api/search?q=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('search failed'))))
        .then((data: SearchResult[]) => {
          if (cancelled) return
          setMemorySearchResults(data.filter((result) => result.sourceType === 'memory_note'))
          setMemorySearchStatus('loaded')
        })
        .catch(() => {
          if (cancelled) return
          setMemorySearchResults([])
          setMemorySearchStatus('error')
        })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [memorySearchQuery])

  useEffect(() => {
    if (memorySearchStatus !== 'loaded') return
    const first = memorySearchResults[0]
    if (!first) return
    const target = noteRefs.current[first.sourceId]
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [memorySearchResults, memorySearchStatus])

  // Fetch CLAUDE.md + auto memory on mount
  useEffect(() => {
    if (!sessionId) return

    fetch(`${DAEMON}/api/memory/${sessionId}/claude-md`)
      .then((r) => r.json())
      .then((data: { content: string | null; path: string | null }) => {
        setClaudeMd(data.content)
        setClaudeMdPath(data.path)
        setEditContent(data.content ?? '')
        setClaudeMdLoaded(true)
      })
      .catch(() => {
        setClaudeMd(null)
        setClaudeMdLoaded(true)
      })

    fetch(`${DAEMON}/api/memory/${sessionId}/auto-memory`)
      .then((r) => r.json())
      .then((data: { content: string | null }) => {
        setAutoMemory(data.content)
      })
      .catch(() => {
        setAutoMemory(null)
      })

    fetch(`${DAEMON}/api/memory/${sessionId}/agents-md`)
      .then((r) => (r.ok ? r.json() : { content: null }))
      .then((data: { content: string | null }) => {
        setAgentsMd(data.content)
      })
      .catch(() => {
        setAgentsMd(null)
      })
  }, [sessionId])

  // Fetch notes on mount (when workspace is available)
  useEffect(() => {
    if (!workspace) return
    fetchNotes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace])

  function fetchNotes() {
    if (!workspace) return
    fetch(`${DAEMON}/api/memory/notes?workspace=${encodeURIComponent(workspace)}`)
      .then((r) => r.json())
      .then((data: MemoryNote[]) => {
        setNotes(data)
      })
      .catch(() => {
        setNotes([])
      })
  }

  async function handleSave() {
    if (!sessionId) return
    setSaving(true)
    try {
      const res = await fetch(`${DAEMON}/api/memory/${sessionId}/claude-md`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      })
      if (!res.ok) throw new Error(`Save failed: ${res.status}`)
      setClaudeMd(editContent)
    } finally {
      setSaving(false)
    }
  }

  async function createClaudeMd() {
    if (!sessionId) return
    const res = await fetch(`${DAEMON}/api/memory/${sessionId}/claude-md`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '' }),
    })
    if (!res.ok) throw new Error(`Create failed: ${res.status}`)
    setClaudeMd('')
    setEditContent('')
  }

  async function handleDeleteNote(noteId: string) {
    await fetch(`${DAEMON}/api/memory/notes/${noteId}`, {
      method: 'DELETE',
    })
    fetchNotes()
  }

  async function handleCreateNote() {
    if (!newNoteText.trim() || !workspace) return
    await fetch(`${DAEMON}/api/memory/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace,
        content: newNoteText,
        pinned: true,
        category: newNoteCategory,
        scope: newNoteScope,
      }),
    })
    setNewNoteText('')
    setNewNoteCategory('other')
    setNewNoteScope('local')
    setShowNewNoteForm(false)
    fetchNotes()
  }

  async function handleApprove(event: NormalizedEvent) {
    const e = event as NormalizedEvent & { id?: string; memoryKey?: string }
    const suggestionId = e.id ?? e.memoryKey ?? String(event.timestamp)
    await fetch(`${DAEMON}/api/memory/suggestions/${encodeURIComponent(suggestionId)}/approve`, {
      method: 'POST',
    })
    setDismissedIds((prev) => new Set([...prev, suggestionId]))
  }

  async function handleReject(event: NormalizedEvent) {
    const e = event as NormalizedEvent & { id?: string; memoryKey?: string }
    const suggestionId = e.id ?? e.memoryKey ?? String(event.timestamp)
    await fetch(`${DAEMON}/api/memory/suggestions/${encodeURIComponent(suggestionId)}`, {
      method: 'DELETE',
    })
    setDismissedIds((prev) => new Set([...prev, suggestionId]))
  }

  // Filter pending suggestions
  const pendingSuggestions = (events ?? EMPTY_EVENTS).filter(
    (e) =>
      e.type === 'memory_write' &&
      (e as NormalizedEvent & { suggested?: boolean }).suggested === true,
  )
  const visibleSuggestions = pendingSuggestions.filter((e) => {
    const ev = e as NormalizedEvent & { id?: string; memoryKey?: string }
    const suggestionId = ev.id ?? ev.memoryKey ?? String(e.timestamp)
    return !dismissedIds.has(suggestionId)
  })

  return (
    <div className="flex flex-col gap-0 p-4 overflow-y-auto h-full">
      {historyMode && (
        <div
          className="[font-family:var(--font-mono-data)] text-xs text-[var(--color-cockpit-accent)] bg-[color-mix(in_srgb,var(--color-cockpit-accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-cockpit-accent)_30%,transparent)] px-3 py-2 mb-3"
          data-testid="history-mode-banner"
        >
          READ-ONLY — viewing a past session
        </div>
      )}
      {/* Section 1: CLAUDE.md Editor */}
      <section>
        <h2 className="cockpit-label mb-2">CLAUDE.md</h2>
        {showActiveWarning && (
          <div className="[font-family:var(--font-mono-data)] text-xs text-amber-200 bg-amber-500/15 border border-amber-400/40 px-3 py-2 mb-2">
            Changes take effect on the next session — a session is currently running.
          </div>
        )}
        {!claudeMdLoaded ? (
          <p className="data-readout-dim text-xs">Loading…</p>
        ) : claudeMd === null ? (
          <div className="data-readout-dim text-xs">
            No CLAUDE.md found.{' '}
            {!historyMode && (
              <button
                onClick={createClaudeMd}
                className="text-[var(--color-cockpit-accent)] underline underline-offset-2"
              >
                Create one
              </button>
            )}
          </div>
        ) : (
          <>
            {!historyMode && (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-64 [font-family:var(--font-mono-data)] text-xs border border-border/80 bg-background/50 text-foreground rounded-none p-2 resize-y focus:border-[color-mix(in_srgb,var(--color-cockpit-accent)_60%,transparent)] focus:outline-none"
                aria-label="CLAUDE.md content"
              />
            )}
            {historyMode && (
              <pre className="text-xs [font-family:var(--font-mono-data)] whitespace-pre-wrap bg-[var(--color-panel-surface)] border border-border/60 p-3 text-muted-foreground">{editContent}</pre>
            )}
            {!historyMode && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="mt-2 cockpit-btn disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
          </>
        )}
      </section>

      {/* Section 2: Auto Memory (read-only) */}
      <section className="mt-6">
        <h2 className="cockpit-label mb-2">Auto Memory</h2>
        {autoMemory === null ? (
          <p className="data-readout-dim text-xs">No auto memory found.</p>
        ) : (
          <pre className="text-xs [font-family:var(--font-mono-data)] whitespace-pre-wrap bg-[var(--color-panel-surface)] border border-border/60 p-3 text-muted-foreground">
            {autoMemory}
          </pre>
        )}
      </section>

      {/* Section 2b: Memory search */}
      <section className="mt-6">
        <h2 className="cockpit-label mb-2">Search Memory</h2>
        <div className="flex gap-2">
          <input
            type="search"
            value={memorySearchQuery}
            onChange={(e) => {
              const next = e.target.value
              setMemorySearchQuery(next)
              setSearchParams(next.trim() ? { q: next } : {})
            }}
            placeholder="Search notes and memory entries…"
            aria-label="Search memory"
            className="w-full border border-border/80 bg-background/50 px-3 py-2 text-sm [font-family:var(--font-mono-data)] text-foreground focus:border-[color-mix(in_srgb,var(--color-cockpit-accent)_60%,transparent)] focus:outline-none"
          />
        </div>
        {memorySearchQuery.trim() && (
          <p className="mt-1 text-[10px] [font-family:var(--font-mono-data)] text-muted-foreground">
            {memorySearchStatus === 'loading'
              ? 'Searching memory notes…'
              : memorySearchStatus === 'error'
                ? 'Search failed.'
                : `${memorySearchResults.length} result${memorySearchResults.length === 1 ? '' : 's'} in memory notes`}
          </p>
        )}
        {memorySearchResults.length > 0 && (
          <div className="mt-2 space-y-2" data-testid="memory-search-results">
            {memorySearchResults.map((result) => {
              const note = notesById.get(result.sourceId)
              return (
                <div
                  key={result.sourceId}
                  className="border border-border/60 bg-[var(--color-panel-surface)] p-2 text-xs"
                  data-testid={`memory-search-result-${result.sourceId}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="[font-family:var(--font-mono-data)] text-[10px] uppercase tracking-wide text-[var(--color-cockpit-accent)]">
                        {note?.category ?? 'other'} · {note?.scope ?? 'local'}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-foreground">{note?.content ?? result.snippet}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const target = noteRefs.current[result.sourceId]
                        if (target && typeof target.scrollIntoView === 'function') {
                          target.scrollIntoView({ block: 'center', behavior: 'smooth' })
                        }
                      }}
                      className="shrink-0 border border-[var(--color-cockpit-accent)]/40 px-2 py-1 text-[10px] uppercase tracking-wide [font-family:var(--font-mono-data)] text-[var(--color-cockpit-accent)]"
                    >
                      Open
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {agentsMd !== null && (
        <section className="mt-6" data-testid="agents-md-section">
          <h2 className="cockpit-label mb-2">AGENTS.md (Codex)</h2>
          <pre className="text-xs [font-family:var(--font-mono-data)] whitespace-pre-wrap bg-[var(--color-panel-surface)] border border-border/60 p-3 text-muted-foreground">
            {agentsMd}
          </pre>
        </section>
      )}

      {/* Section 3: Pinned Notes */}
      <section className="mt-6">
        <h2 className="cockpit-label mb-2">Pinned Notes</h2>
        <div className="mb-2 flex flex-wrap gap-1" data-testid="memory-category-filter">
          {(['all', ...NOTE_CATEGORIES] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`border px-1.5 py-0.5 text-[9px] uppercase tracking-wide [font-family:var(--font-mono-data)] ${
                categoryFilter === cat
                  ? 'border-[var(--color-cockpit-accent)] text-[var(--color-cockpit-accent)]'
                  : 'border-border/60 text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`memory-filter-${cat}`}
            >
              {cat}
            </button>
          ))}
        </div>
        {notes
          .filter((note) => categoryFilter === 'all' || note.category === categoryFilter)
          .map((note) => (
          <div
            key={note.note_id}
            ref={(el) => {
              noteRefs.current[note.note_id] = el
            }}
            id={`memory-note-${note.note_id}`}
            className="flex items-start gap-2 mb-2 p-2 border border-border/60 bg-[var(--color-panel-surface)]"
            data-testid={`memory-note-card-${note.note_id}`}
          >
            <div className="flex-1 min-w-0">
              <div className="mb-1 flex flex-wrap gap-1">
                <span
                  data-testid={`memory-note-category-${note.note_id}`}
                  className="border border-[var(--color-cockpit-cyan)]/35 px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-cockpit-cyan)]"
                >
                  {note.category}
                </span>
                <span
                  data-testid={`memory-note-scope-${note.note_id}`}
                  className="border border-border/60 px-1 py-0.5 text-[8px] uppercase tracking-wide text-muted-foreground"
                >
                  {note.scope}
                </span>
              </div>
              <p className="text-xs [font-family:var(--font-mono-data)] whitespace-pre-wrap text-foreground">{note.content}</p>
            </div>
            {!historyMode && (
              <button
                onClick={() => handleDeleteNote(note.note_id)}
                className="[font-family:var(--font-mono-data)] text-[10px] text-[var(--color-cockpit-red)]/80 hover:text-[var(--color-cockpit-red)] transition-colors shrink-0"
              >
                Delete
              </button>
            )}
          </div>
        ))}
        {!historyMode && (
          showNewNoteForm ? (
            <div className="mt-2">
              <textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Note content…"
                className="w-full h-24 text-xs [font-family:var(--font-mono-data)] border border-border/80 bg-background/50 text-foreground rounded-none p-2 focus:border-[color-mix(in_srgb,var(--color-cockpit-accent)_60%,transparent)] focus:outline-none"
                aria-label="New note content"
              />
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <select
                  value={newNoteCategory}
                  onChange={(e) => setNewNoteCategory(e.target.value as MemoryNoteCategory)}
                  aria-label="Note category"
                  className="rounded-none border border-border/80 bg-background/50 px-1 py-0.5 text-[10px] [font-family:var(--font-mono-data)]"
                  data-testid="new-note-category"
                >
                  {NOTE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <select
                  value={newNoteScope}
                  onChange={(e) => setNewNoteScope(e.target.value as MemoryNoteScope)}
                  aria-label="Note scope"
                  className="rounded-none border border-border/80 bg-background/50 px-1 py-0.5 text-[10px] [font-family:var(--font-mono-data)]"
                  data-testid="new-note-scope"
                >
                  <option value="local">local</option>
                  <option value="shared">shared</option>
                </select>
                <button
                  onClick={handleCreateNote}
                  className="cockpit-btn"
                  style={{ color: 'var(--color-cockpit-green)', borderColor: 'var(--color-cockpit-green)/50' }}
                >
                  Save Note
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNewNoteForm(true)}
              className="[font-family:var(--font-mono-data)] text-[10px] text-[var(--color-cockpit-accent)] mt-1 hover:underline underline-offset-2"
            >
              + New Note
            </button>
          )
        )}
      </section>

      {/* Section 4: Pending Suggestions */}
      <section className="mt-6">
        <h2 className="cockpit-label mb-2">Pending Suggestions</h2>
        {visibleSuggestions.length === 0 ? (
          <p className="data-readout-dim text-xs">No pending suggestions.</p>
        ) : (
          visibleSuggestions.map((e) => {
            const ev = e as NormalizedEvent & { memoryKey?: string; value?: string; id?: string }
            const suggestionId = ev.id ?? ev.memoryKey ?? String(e.timestamp)
            return (
              <div
                key={e.sessionId + suggestionId}
                className="cockpit-frame-full p-3 border border-border/60 bg-[var(--color-panel-surface)] mb-2"
              >
                <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
                <span className="cockpit-corner cockpit-corner-br" aria-hidden />
                <p className="[font-family:var(--font-mono-data)] text-xs font-semibold text-[var(--color-cockpit-accent)]">{ev.memoryKey}</p>
                <p className="text-xs mt-1 whitespace-pre-wrap text-muted-foreground [font-family:var(--font-mono-data)]">{ev.value}</p>
                {!historyMode && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleApprove(e)}
                      className="text-[10px] px-2 py-1 [font-family:var(--font-mono-data)] uppercase tracking-wide bg-[var(--color-cockpit-green)]/20 border border-[var(--color-cockpit-green)]/50 text-[var(--color-cockpit-green)] hover:bg-[var(--color-cockpit-green)]/30 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(e)}
                      className="text-[10px] px-2 py-1 [font-family:var(--font-mono-data)] uppercase tracking-wide bg-[var(--color-cockpit-red)]/20 border border-[var(--color-cockpit-red)]/50 text-[var(--color-cockpit-red)] hover:bg-[var(--color-cockpit-red)]/30 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </section>
    </div>
  )
}
