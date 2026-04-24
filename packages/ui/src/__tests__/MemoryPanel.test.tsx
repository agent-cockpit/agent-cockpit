import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { useStore } from '../store/index.js'
import { MemoryPanel } from '../components/panels/MemoryPanel.js'
import type { NormalizedEvent } from '@agentcockpit/shared'

const SESSION_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE = '/home/user/project'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSession(status: 'active' | 'ended' | 'error' = 'ended') {
  return {
    sessionId: SESSION_ID,
    provider: 'claude' as const,
    workspacePath: WORKSPACE,
    startedAt: '2026-01-01T00:00:00.000Z',
    status,
    lastEventAt: '2026-01-01T00:01:00.000Z',
    pendingApprovals: 0,
  }
}

function makeMemoryWriteEvent(memoryKey: string, value: string, suggested: boolean): NormalizedEvent {
  return {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    timestamp: '2026-01-01T00:00:30.000Z',
    type: 'memory_write',
    provider: 'claude',
    memoryKey,
    value,
    suggested,
  } as unknown as NormalizedEvent
}

function renderPanel(sessionId: string = SESSION_ID) {
  render(
    <MemoryRouter initialEntries={[`/session/${sessionId}/memory`]}>
      <Routes>
        <Route path="/session/:sessionId/memory" element={<MemoryPanel />} />
      </Routes>
    </MemoryRouter>,
  )
}

// ─── Default fetch mock factory ───────────────────────────────────────────────

type FetchMock = ReturnType<typeof vi.fn>

function makeFetchMock(overrides: Record<string, unknown> = {}): FetchMock {
  return vi.fn((url: string, opts?: RequestInit) => {
    const method = (opts?.method ?? 'GET').toUpperCase()
    const u = String(url)

    if (method === 'GET' && u.includes('/claude-md')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            overrides['claude-md'] ?? {
              content: '# My project',
              path: `${WORKSPACE}/CLAUDE.md`,
            },
          ),
      })
    }
    if (method === 'GET' && u.includes('/auto-memory')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            overrides['auto-memory'] ?? { content: '# Auto memory\n- learned X' },
          ),
      })
    }
    if (method === 'GET' && u.includes('/notes')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            overrides['notes'] ?? [
              {
                note_id: 'n1',
                workspace: WORKSPACE,
                content: 'My note',
                pinned: 1,
                created_at: '2026-01-01T00:00:00.000Z',
              },
            ],
          ),
      })
    }
    if (method === 'POST' && u.includes('/notes')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            note_id: 'n2',
            workspace: WORKSPACE,
            content: 'New note',
            pinned: 1,
            created_at: '2026-01-01T00:00:01.000Z',
          }),
      })
    }
    if (method === 'DELETE' && u.includes('/notes/')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
    }
    if (method === 'PUT' && u.includes('/claude-md')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
    }
    if (method === 'POST' && u.includes('/approve')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
    }
    if (method === 'DELETE' && u.includes('/suggestions/')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  useStore.setState({ events: {}, sessions: {} })
  vi.stubGlobal('fetch', makeFetchMock())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── MEM-01: Read CLAUDE.md + auto memory ─────────────────────────────────────

describe('MEM-01: Read CLAUDE.md + auto memory', () => {
  it('renders CLAUDE.md content from fetch response', async () => {
    useStore.setState({ sessions: { [SESSION_ID]: makeSession() } })
    renderPanel()

    const textarea = await screen.findByRole('textbox', { name: /CLAUDE\.md content/i })
    expect(textarea).toHaveValue('# My project')
  })

  it('renders auto memory section', async () => {
    useStore.setState({ sessions: { [SESSION_ID]: makeSession() } })
    renderPanel()

    // Wait for auto memory content to appear
    const autoContent = await screen.findByText(/# Auto memory/i)
    expect(autoContent).toBeInTheDocument()
  })
})

// ─── MEM-02: Edit CLAUDE.md ───────────────────────────────────────────────────

describe('MEM-02: Edit CLAUDE.md', () => {
  it('textarea pre-filled with CLAUDE.md content', async () => {
    useStore.setState({ sessions: { [SESSION_ID]: makeSession() } })
    renderPanel()

    const textarea = await screen.findByRole('textbox', { name: /CLAUDE\.md content/i })
    expect(textarea).toHaveValue('# My project')
  })

  it('save button triggers PUT request with updated content', async () => {
    useStore.setState({ sessions: { [SESSION_ID]: makeSession() } })
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    renderPanel()

    const textarea = await screen.findByRole('textbox', { name: /CLAUDE\.md content/i })
    fireEvent.change(textarea, { target: { value: 'Updated content' } })

    const saveBtn = screen.getByRole('button', { name: /save/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      const putCalls = (fetchMock as FetchMock).mock.calls.filter(
        ([url, opts]) => String(url).includes('/claude-md') && (opts as RequestInit | undefined)?.method === 'PUT',
      )
      expect(putCalls).toHaveLength(1)
      const body = JSON.parse((putCalls[0][1] as RequestInit).body as string)
      expect(body.content).toBe('Updated content')
    })
  })

  it('shows active-session warning when session.status is active', async () => {
    useStore.setState({ sessions: { [SESSION_ID]: makeSession('active') } })
    renderPanel()

    const warning = await screen.findByText(/a session is currently running/i)
    expect(warning).toBeInTheDocument()
  })

  it('no active-session warning when session.status is ended', async () => {
    useStore.setState({ sessions: { [SESSION_ID]: makeSession('ended') } })
    renderPanel()

    // Wait for component to load (textarea should appear)
    await screen.findByRole('textbox', { name: /CLAUDE\.md content/i })
    expect(screen.queryByText(/a session is currently running/i)).not.toBeInTheDocument()
  })
})

// ─── MEM-03: Memory notes ─────────────────────────────────────────────────────

describe('MEM-03: Memory notes', () => {
  it('renders notes list from GET /api/memory/notes response', async () => {
    useStore.setState({ sessions: { [SESSION_ID]: makeSession() } })
    renderPanel()

    const note = await screen.findByText('My note')
    expect(note).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('delete button calls DELETE /api/memory/notes/:noteId', async () => {
    useStore.setState({ sessions: { [SESSION_ID]: makeSession() } })
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    renderPanel()

    await screen.findByText('My note')
    const deleteBtn = screen.getByRole('button', { name: /delete/i })
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      const deleteCalls = (fetchMock as FetchMock).mock.calls.filter(
        ([url, opts]) =>
          String(url).includes('/notes/n1') &&
          (opts as RequestInit | undefined)?.method === 'DELETE',
      )
      expect(deleteCalls).toHaveLength(1)
    })
  })

  it('new note form submits POST and refreshes list', async () => {
    useStore.setState({ sessions: { [SESSION_ID]: makeSession() } })
    // Start with no notes so we can verify the new one appears
    const fetchMock = makeFetchMock({ notes: [] })
    // After POST, GET notes should return new note
    let notesFetchCount = 0
    const smartFetch = vi.fn((url: string, opts?: RequestInit) => {
      const method = (opts?.method ?? 'GET').toUpperCase()
      const u = String(url)
      if (method === 'GET' && u.includes('/notes')) {
        notesFetchCount++
        if (notesFetchCount > 1) {
          // Refresh after POST
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                {
                  note_id: 'n2',
                  workspace: WORKSPACE,
                  content: 'New note',
                  pinned: 1,
                  created_at: '2026-01-01T00:00:01.000Z',
                },
              ]),
          })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      }
      return (fetchMock as FetchMock)(url, opts)
    })
    vi.stubGlobal('fetch', smartFetch)

    renderPanel()

    // Click "+ New Note"
    const newNoteBtn = await screen.findByRole('button', { name: /\+ New Note/i })
    fireEvent.click(newNoteBtn)

    // Type in the new note textarea
    const noteTextarea = screen.getByRole('textbox', { name: /new note content/i })
    fireEvent.change(noteTextarea, { target: { value: 'New note' } })

    // Click "Save Note"
    const saveNoteBtn = screen.getByRole('button', { name: /save note/i })
    fireEvent.click(saveNoteBtn)

    await waitFor(() => {
      const postCalls = (smartFetch as FetchMock).mock.calls.filter(
        ([url, opts]) =>
          String(url).includes('/notes') &&
          (opts as RequestInit | undefined)?.method === 'POST',
      )
      expect(postCalls).toHaveLength(1)
    })

    // New note should appear after list refresh
    expect(await screen.findByText('New note')).toBeInTheDocument()
  })
})

// ─── MEM-04: Suggested memory writes ─────────────────────────────────────────

describe('MEM-04: Suggested memory writes', () => {
  it('renders pending suggestion cards for memory_write events with suggested=true', async () => {
    useStore.setState({
      sessions: { [SESSION_ID]: makeSession() },
      events: {
        [SESSION_ID]: [makeMemoryWriteEvent('projectName', 'cockpit', true)],
      },
    })
    renderPanel()

    // Should show the memoryKey and value
    expect(await screen.findByText('projectName')).toBeInTheDocument()
    expect(screen.getByText('cockpit')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
  })

  it('does not show suggestion cards for memory_write events with suggested=false', async () => {
    useStore.setState({
      sessions: { [SESSION_ID]: makeSession() },
      events: {
        [SESSION_ID]: [makeMemoryWriteEvent('projectName', 'cockpit', false)],
      },
    })
    renderPanel()

    // Wait for component to load
    await screen.findByText(/No pending suggestions/i)
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
  })

  it('approve button sends POST to /api/memory/suggestions/:id/approve', async () => {
    useStore.setState({
      sessions: { [SESSION_ID]: makeSession() },
      events: {
        [SESSION_ID]: [makeMemoryWriteEvent('projectName', 'cockpit', true)],
      },
    })
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    renderPanel()

    const approveBtn = await screen.findByRole('button', { name: /approve/i })
    fireEvent.click(approveBtn)

    await waitFor(() => {
      const approveCalls = (fetchMock as FetchMock).mock.calls.filter(
        ([url, opts]) =>
          String(url).includes('/suggestions/') &&
          String(url).includes('/approve') &&
          (opts as RequestInit | undefined)?.method === 'POST',
      )
      expect(approveCalls).toHaveLength(1)
    })

    // Card should be removed from UI after approve
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
    })
  })

  it('reject button sends DELETE to /api/memory/suggestions/:id', async () => {
    useStore.setState({
      sessions: { [SESSION_ID]: makeSession() },
      events: {
        [SESSION_ID]: [makeMemoryWriteEvent('projectName', 'cockpit', true)],
      },
    })
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    renderPanel()

    const rejectBtn = await screen.findByRole('button', { name: /reject/i })
    fireEvent.click(rejectBtn)

    await waitFor(() => {
      const rejectCalls = (fetchMock as FetchMock).mock.calls.filter(
        ([url, opts]) =>
          String(url).includes('/suggestions/') &&
          !String(url).includes('/approve') &&
          (opts as RequestInit | undefined)?.method === 'DELETE',
      )
      expect(rejectCalls).toHaveLength(1)
    })

    // Card should be removed from UI after reject
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument()
    })
  })
})

// ─── HIST-02: Read-only guard when historyMode=true ───────────────────────────

describe('HIST-02: Read-only guard when historyMode', () => {
  it('Test 10: historyMode=false — edit controls are present', async () => {
    useStore.setState({
      sessions: { [SESSION_ID]: makeSession() },
      historyMode: false,
      events: {
        [SESSION_ID]: [makeMemoryWriteEvent('key1', 'val1', true)],
      },
    })
    renderPanel()

    // CLAUDE.md textarea and save button should be present
    const textarea = await screen.findByRole('textbox', { name: /CLAUDE\.md content/i })
    expect(textarea).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
    expect(screen.getByText(/\+ New Note/i)).toBeInTheDocument()
  })

  it('Test 11: historyMode=true — all edit controls are absent', async () => {
    useStore.setState({
      sessions: { [SESSION_ID]: makeSession() },
      historyMode: true,
      events: {
        [SESSION_ID]: [makeMemoryWriteEvent('key1', 'val1', true)],
      },
    })
    renderPanel()

    // Wait for panel to load
    await screen.findByTestId('history-mode-banner')

    // Edit controls must be absent
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/\+ New Note/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument()

    // Read-only banner must be visible
    expect(screen.getByTestId('history-mode-banner')).toBeInTheDocument()
  })
})
