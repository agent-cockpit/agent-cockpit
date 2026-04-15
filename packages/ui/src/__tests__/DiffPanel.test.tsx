import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { useStore } from '../store/index.js'
import { DiffPanel } from '../components/panels/DiffPanel.js'
import type { NormalizedEvent } from '@cockpit/shared'

const SESSION_ID = '00000000-0000-0000-0000-000000000001'
const T_START = '2026-01-01T00:00:00.000Z'
const T_END = '2026-01-01T00:01:30.000Z' // 90 seconds after start

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
): NormalizedEvent {
  return {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    timestamp: T_START,
    type: 'file_change',
    filePath,
    changeType,
    ...(diff !== undefined ? { diff } : {}),
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
  useStore.setState({ events: {}, sessions: {} })
})

// ─── DIFF-01: File tree ────────────────────────────────────────────────────────

describe('DIFF-01: File tree from file_change events', () => {
  it('DIFF-01-a: shows one row when there is one file_change event', () => {
    useStore.setState({
      events: {
        [SESSION_ID]: [makeFileChange('/home/user/project/src/index.ts')],
      },
      sessions: {},
    })

    renderPanel(SESSION_ID)

    const rows = screen.getAllByTestId('file-tree-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('index.ts')
  })

  it('DIFF-01-b: two file_change events for the same filePath shows only one row (dedup)', () => {
    useStore.setState({
      events: {
        [SESSION_ID]: [
          makeFileChange('/home/user/project/src/index.ts', 'modified'),
          makeFileChange('/home/user/project/src/index.ts', 'modified'),
        ],
      },
      sessions: {},
    })

    renderPanel(SESSION_ID)

    const rows = screen.getAllByTestId('file-tree-row')
    expect(rows).toHaveLength(1)
  })

  it('DIFF-01-c: two file_change events for different filePaths shows two rows', () => {
    useStore.setState({
      events: {
        [SESSION_ID]: [
          makeFileChange('/home/user/project/src/index.ts'),
          makeFileChange('/home/user/project/src/utils.ts'),
        ],
      },
      sessions: {},
    })

    renderPanel(SESSION_ID)

    const rows = screen.getAllByTestId('file-tree-row')
    expect(rows).toHaveLength(2)
  })

  it('Empty state: no file_change events shows empty-state message', () => {
    useStore.setState({
      events: { [SESSION_ID]: [makeSessionStart()] },
      sessions: {},
    })

    renderPanel(SESSION_ID)

    expect(screen.getByText('No files changed')).toBeInTheDocument()
    expect(screen.queryByTestId('file-tree-row')).not.toBeInTheDocument()
  })
})

// ─── DIFF-02: Colorized diff view ─────────────────────────────────────────────

describe('DIFF-02: Per-file colorized diff view', () => {
  it('DIFF-02-a: clicking a file row renders diff with green + lines and red - lines', () => {
    const diff = '--- a/index.ts\n+++ b/index.ts\n@@ -1 +1 @@\n-old line\n+new line\n context'
    useStore.setState({
      events: {
        [SESSION_ID]: [makeFileChange('/home/user/project/src/index.ts', 'modified', diff)],
      },
      sessions: {},
    })

    renderPanel(SESSION_ID)

    const row = screen.getByTestId('file-tree-row')
    fireEvent.click(row)

    // + lines (not +++) should have green class
    const addLines = screen.getAllByTestId('diff-line-add')
    expect(addLines.length).toBeGreaterThan(0)
    expect(addLines[0]).toHaveClass('text-green-600')

    // - lines (not ---) should have red class
    const delLines = screen.getAllByTestId('diff-line-del')
    expect(delLines.length).toBeGreaterThan(0)
    expect(delLines[0]).toHaveClass('text-red-600')
  })

  it('DIFF-02-b: when diff is absent, clicking the file row shows "No diff available"', () => {
    useStore.setState({
      events: {
        [SESSION_ID]: [makeFileChange('/home/user/project/src/index.ts', 'modified', undefined)],
      },
      sessions: {},
    })

    renderPanel(SESSION_ID)

    const row = screen.getByTestId('file-tree-row')
    fireEvent.click(row)

    expect(screen.getByText('No diff available')).toBeInTheDocument()
  })
})

// ─── DIFF-03: Summary banner ───────────────────────────────────────────────────

describe('DIFF-03: Summary banner', () => {
  it('DIFF-03-a: summary banner shows files touched count', () => {
    useStore.setState({
      events: {
        [SESSION_ID]: [makeFileChange('/home/user/project/src/index.ts')],
      },
      sessions: {},
    })

    renderPanel(SESSION_ID)

    expect(screen.getByText('1 file changed')).toBeInTheDocument()
  })

  it('DIFF-03-a: summary banner uses plural "files" for multiple changed files', () => {
    useStore.setState({
      events: {
        [SESSION_ID]: [
          makeFileChange('/home/user/project/src/index.ts'),
          makeFileChange('/home/user/project/src/utils.ts'),
        ],
      },
      sessions: {},
    })

    renderPanel(SESSION_ID)

    expect(screen.getByText('2 files changed')).toBeInTheDocument()
  })

  it('DIFF-03-b: summary banner shows session status from sessions store', () => {
    useStore.setState({
      events: { [SESSION_ID]: [] },
      sessions: {
        [SESSION_ID]: {
          sessionId: SESSION_ID,
          provider: 'claude',
          workspacePath: '/home/user/project',
          startedAt: T_START,
          status: 'active',
          lastEventAt: T_START,
          pendingApprovals: 0,
          character: 'astronaut',
        },
      },
    })

    renderPanel(SESSION_ID)

    expect(screen.getByText('active')).toBeInTheDocument()
  })

  it('DIFF-03-c: summary banner shows elapsed time from session_start to session_end', () => {
    useStore.setState({
      events: {
        [SESSION_ID]: [makeSessionStart(T_START), makeSessionEnd(T_END)],
      },
      sessions: {},
    })

    renderPanel(SESSION_ID)

    // T_START to T_END is 90 seconds = 1m 30s
    expect(screen.getByText('1m 30s')).toBeInTheDocument()
  })
})
