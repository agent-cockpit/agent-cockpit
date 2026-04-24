import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { useStore } from '../store/index.js'
import { DiffPanel } from '../components/panels/DiffPanel.js'
import type { NormalizedEvent } from '@agentcockpit/shared'

const mockFetch = vi.fn()
global.fetch = mockFetch

const SESSION_ID = '00000000-0000-0000-0000-000000000001'
const T_START = '2026-01-01T00:00:00.000Z'
const T_MID = '2026-01-01T00:00:30.000Z'
const T_END = '2026-01-01T00:01:30.000Z'

function makeSessionStart(timestamp = T_START): NormalizedEvent {
  return {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    timestamp,
    type: 'session_start',
    provider: 'claude',
    workspacePath: '/home/user/project',
  }
}

function makeSessionEnd(timestamp = T_END): NormalizedEvent {
  return {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    timestamp,
    type: 'session_end',
    provider: 'claude',
    exitCode: 0,
  }
}

function makeFileChange(
  filePath: string,
  changeType: 'created' | 'modified' | 'deleted' = 'modified',
  diff?: string,
  timestamp = T_MID,
): NormalizedEvent {
  return {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    timestamp,
    type: 'file_change',
    filePath,
    changeType,
    ...(diff !== undefined ? { diff } : {}),
  }
}

function makeToolCall(
  toolName: string,
  input: Record<string, unknown>,
  timestamp = T_MID,
): NormalizedEvent {
  return {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    timestamp,
    type: 'tool_call',
    toolName,
    input,
  }
}

function renderPanel(sessionId: string) {
  return render(
    <MemoryRouter initialEntries={[`/session/${sessionId}/diff`]}>
      <Routes>
        <Route path="/session/:sessionId/diff" element={<DiffPanel />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockFetch.mockReset()
  useStore.setState({ events: {}, sessions: {}, selectedSessionId: null })
})

describe('DiffPanel', () => {
  it('fetches session events on mount when the store is empty', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => [makeSessionStart(), makeFileChange('/home/user/project/src/index.ts')],
    })

    await act(async () => {
      renderPanel(SESSION_ID)
    })

    expect(mockFetch).toHaveBeenCalledOnce()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/sessions/${SESSION_ID}/events`),
    )

    await vi.waitFor(() => {
      expect(useStore.getState().events[SESSION_ID]).toHaveLength(2)
    })
  })

  it('does not fetch when events for the session are already loaded', () => {
    useStore.setState({
      events: {
        [SESSION_ID]: [makeSessionStart(), makeFileChange('/home/user/project/src/index.ts')],
      },
    })

    renderPanel(SESSION_ID)

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('shows one row per changed file and deduplicates repeated file_change events', () => {
    useStore.setState({
      events: {
        [SESSION_ID]: [
          makeFileChange('/home/user/project/src/index.ts', 'modified', undefined, T_START),
          makeFileChange('/home/user/project/src/index.ts', 'modified', '--- a/index.ts\n+++ b/index.ts', T_MID),
          makeFileChange('/home/user/project/src/utils.ts', 'created', undefined, T_END),
        ],
      },
    })

    renderPanel(SESSION_ID)

    const rows = screen.getAllByTestId('file-tree-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('utils.ts')
    expect(rows[1]).toHaveTextContent('index.ts')
  })

  it('auto-selects the most recently touched file and renders its diff', () => {
    const diff = '--- a/index.ts\n+++ b/index.ts\n@@ -1 +1 @@\n-old line\n+new line\n context'
    useStore.setState({
      events: {
        [SESSION_ID]: [
          makeFileChange('/home/user/project/src/older.ts', 'modified', undefined, T_START),
          makeFileChange('/home/user/project/src/index.ts', 'modified', diff, T_END),
        ],
      },
    })

    renderPanel(SESSION_ID)

    const rows = screen.getAllByTestId('file-tree-row')
    expect(rows[0]).toHaveTextContent('index.ts')
    expect(screen.getByTestId('diff-line-add')).toHaveTextContent('+new line')
    expect(screen.getByTestId('diff-line-del')).toHaveTextContent('-old line')
  })

  it('shows "No diff available" when the selected file has no diff payload', () => {
    useStore.setState({
      events: {
        [SESSION_ID]: [makeFileChange('/home/user/project/src/index.ts')],
      },
    })

    renderPanel(SESSION_ID)

    expect(screen.getByText('No diff available')).toBeInTheDocument()
  })

  it('lets the user switch files from the tree', () => {
    const firstDiff = '--- a/one.ts\n+++ b/one.ts\n@@ -1 +1 @@\n-old one\n+new one'
    const secondDiff = '--- a/two.ts\n+++ b/two.ts\n@@ -1 +1 @@\n-old two\n+new two'
    useStore.setState({
      events: {
        [SESSION_ID]: [
          makeFileChange('/home/user/project/src/one.ts', 'modified', firstDiff, T_START),
          makeFileChange('/home/user/project/src/two.ts', 'modified', secondDiff, T_END),
        ],
      },
    })

    renderPanel(SESSION_ID)

    const rows = screen.getAllByTestId('file-tree-row')
    fireEvent.click(rows[1]!)

    expect(screen.getByText('-old one')).toBeInTheDocument()
    expect(screen.getByText('+new one')).toBeInTheDocument()
  })

  it('builds a fallback diff from Claude Edit tool payloads', () => {
    useStore.setState({
      events: {
        [SESSION_ID]: [
          makeToolCall(
            'Edit',
            {
              file_path: '/home/user/project/src/index.ts',
              old_string: 'const greeting = "Hi"',
              new_string: 'const greeting = "Hello"',
            },
            T_END,
          ),
        ],
      },
    })

    renderPanel(SESSION_ID)

    expect(screen.getByTestId('diff-line-del')).toHaveTextContent('-const greeting = "Hi"')
    expect(screen.getByTestId('diff-line-add')).toHaveTextContent('+const greeting = "Hello"')
  })

  it('builds a fallback diff from Claude Write tool payloads', () => {
    useStore.setState({
      events: {
        [SESSION_ID]: [
          makeToolCall(
            'Write',
            {
              file_path: '/home/user/project/src/new-file.ts',
              content: 'export const answer = 42\nconsole.log(answer)',
            },
            T_END,
          ),
        ],
      },
    })

    renderPanel(SESSION_ID)

    const addedLines = screen.getAllByTestId('diff-line-add')
    expect(addedLines[0]).toHaveTextContent('+export const answer = 42')
    expect(addedLines[1]).toHaveTextContent('+console.log(answer)')
  })

  it('shows the empty state when there are no file_change events', () => {
    useStore.setState({
      events: { [SESSION_ID]: [makeSessionStart()] },
    })

    renderPanel(SESSION_ID)

    expect(screen.getByText('No files changed')).toBeInTheDocument()
    expect(screen.queryByTestId('file-tree-row')).not.toBeInTheDocument()
    expect(screen.getByText('-- SELECT FILE --')).toBeInTheDocument()
  })

  it('renders the summary banner with file count, status, and elapsed time', () => {
    useStore.setState({
      events: {
        [SESSION_ID]: [
          makeSessionStart(T_START),
          makeFileChange('/home/user/project/src/index.ts', 'modified', undefined, T_MID),
          makeSessionEnd(T_END),
        ],
      },
      sessions: {
        [SESSION_ID]: {
          sessionId: SESSION_ID,
          provider: 'claude',
          workspacePath: '/home/user/project',
          startedAt: T_START,
          status: 'ended',
          lastEventAt: T_END,
          pendingApprovals: 0,
          character: 'astronaut',
        },
      },
    })

    renderPanel(SESSION_ID)

    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByText('ended')).toBeInTheDocument()
    expect(screen.getByText('1m 30s')).toBeInTheDocument()
  })

  it('renders fetched rows after hydrating from the backend', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => [
        makeSessionStart(),
        makeFileChange(
          '/home/user/project/src/index.ts',
          'modified',
          '--- a/index.ts\n+++ b/index.ts\n@@ -1 +1 @@\n-old line\n+new line',
        ),
      ],
    })

    await act(async () => {
      renderPanel(SESSION_ID)
    })

    await vi.waitFor(() => {
      expect(screen.getAllByTestId('file-tree-row')).toHaveLength(1)
    })

    const fileList = within(screen.getByTestId('file-tree-row'))
    expect(fileList.getByText('index.ts')).toBeInTheDocument()
    expect(screen.getByText('+new line')).toBeInTheDocument()
  })
})
