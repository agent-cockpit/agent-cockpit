import { useState, useEffect } from 'react'
import { useParams } from 'react-router'
import type { NormalizedEvent } from '@cockpit/shared'
import { useStore } from '../../store/index.js'
import { getSessionEvents, EMPTY_EVENTS } from '../../store/eventsSlice.js'

const DAEMON = 'http://localhost:3001'

interface MemoryNote {
  note_id: string
  workspace: string
  content: string
  pinned: number
  created_at: string
}

export function MemoryPanel() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const session = useStore((s) => s.sessions[sessionId ?? ''])
  const events = useStore((s) => getSessionEvents(s, sessionId ?? ''))
  const historyMode = useStore((s) => s.historyMode)

  // CLAUDE.md state
  const [claudeMd, setClaudeMd] = useState<string | null>(undefined as unknown as null)
  const [claudeMdPath, setClaudeMdPath] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [claudeMdLoaded, setClaudeMdLoaded] = useState(false)

  // Auto memory state
  const [autoMemory, setAutoMemory] = useState<string | null>(null)

  // Notes state
  const [notes, setNotes] = useState<MemoryNote[]>([])
  const [showNewNoteForm, setShowNewNoteForm] = useState(false)
  const [newNoteText, setNewNoteText] = useState('')

  // Dismissed suggestion IDs
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  const showActiveWarning = session?.status === 'active'
  const workspace = session?.workspacePath ?? ''

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
      await fetch(`${DAEMON}/api/memory/${sessionId}/claude-md`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      })
      setClaudeMd(editContent)
    } finally {
      setSaving(false)
    }
  }

  async function createClaudeMd() {
    if (!sessionId) return
    await fetch(`${DAEMON}/api/memory/${sessionId}/claude-md`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '' }),
    })
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
      body: JSON.stringify({ workspace, content: newNoteText, pinned: true }),
    })
    setNewNoteText('')
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
        <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2 mb-2" data-testid="history-mode-banner">
          Read-only — viewing a past session
        </div>
      )}
      {/* Section 1: CLAUDE.md Editor */}
      <section>
        <h2 className="text-sm font-semibold mb-2">CLAUDE.md</h2>
        {showActiveWarning && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-2">
            Changes take effect on the next session — a session is currently running.
          </div>
        )}
        {!claudeMdLoaded ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : claudeMd === null ? (
          <div className="text-xs text-gray-500">
            No CLAUDE.md found.{' '}
            {!historyMode && (
              <button
                onClick={createClaudeMd}
                className="text-blue-600 underline"
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
                className="w-full h-64 font-mono text-xs border rounded p-2 resize-y"
                aria-label="CLAUDE.md content"
              />
            )}
            {historyMode && (
              <pre className="text-xs font-mono whitespace-pre-wrap bg-gray-50 border rounded p-2">{editContent}</pre>
            )}
            {!historyMode && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="mt-2 px-3 py-1 text-sm bg-blue-600 text-white rounded disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
          </>
        )}
      </section>

      {/* Section 2: Auto Memory (read-only) */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold mb-2">Auto Memory</h2>
        {autoMemory === null ? (
          <p className="text-xs text-gray-500">No auto memory found.</p>
        ) : (
          <pre className="text-xs font-mono whitespace-pre-wrap bg-gray-50 border rounded p-3">
            {autoMemory}
          </pre>
        )}
      </section>

      {/* Section 3: Pinned Notes */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold mb-2">Pinned Notes</h2>
        {notes.map((note) => (
          <div
            key={note.note_id}
            className="flex items-start gap-2 mb-2 p-2 border rounded"
          >
            <p className="flex-1 text-xs whitespace-pre-wrap">{note.content}</p>
            {!historyMode && (
              <button
                onClick={() => handleDeleteNote(note.note_id)}
                className="text-xs text-red-600"
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
                className="w-full h-24 text-xs border rounded p-2"
                aria-label="New note content"
              />
              <button
                onClick={handleCreateNote}
                className="mt-1 px-3 py-1 text-sm bg-green-600 text-white rounded"
              >
                Save Note
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewNoteForm(true)}
              className="text-xs text-blue-600 mt-1"
            >
              + New Note
            </button>
          )
        )}
      </section>

      {/* Section 4: Pending Suggestions */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold mb-2">Pending Suggestions</h2>
        {visibleSuggestions.length === 0 ? (
          <p className="text-xs text-gray-500">No pending suggestions.</p>
        ) : (
          visibleSuggestions.map((e) => {
            const ev = e as NormalizedEvent & { memoryKey?: string; value?: string; id?: string }
            const suggestionId = ev.id ?? ev.memoryKey ?? String(e.timestamp)
            return (
              <div
                key={e.sessionId + suggestionId}
                className="p-3 border rounded mb-2"
              >
                <p className="text-xs font-mono font-semibold">{ev.memoryKey}</p>
                <p className="text-xs mt-1 whitespace-pre-wrap">{ev.value}</p>
                {!historyMode && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleApprove(e)}
                      className="text-xs px-2 py-1 bg-green-600 text-white rounded"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(e)}
                      className="text-xs px-2 py-1 bg-red-600 text-white rounded"
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
