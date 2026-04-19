import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryPage } from '../pages/HistoryPage.js'
import type { SessionSummary } from '../store/index.js'
import { useStore } from '../store/index.js'

// Mock useNavigate from react-router
const mockNavigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const SESSION_1: SessionSummary = {
  sessionId: 'aaaaaaaa-0000-0000-0000-000000000001',
  provider: 'claude',
  workspacePath: '/repos/alpha',
  startedAt: new Date().toISOString(),
  endedAt: null,
  approvalCount: 2,
  filesChanged: 4,
  finalStatus: 'active',
}

const SESSION_2: SessionSummary = {
  sessionId: 'bbbbbbbb-0000-0000-0000-000000000002',
  provider: 'codex',
  workspacePath: '/repos/beta',
  startedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
  endedAt: '2026-01-01T01:00:00.000Z',
  approvalCount: 0,
  filesChanged: 1,
  finalStatus: 'ended',
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/history']}>
      <Routes>
        <Route path="/history" element={<HistoryPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useStore.setState({
    historySessions: {},
    historyMode: false,
    compareSelectionIds: [],
  })
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE' && String(input).includes('/api/sessions')) {
        const parsed = init.body ? JSON.parse(String(init.body)) as { sessionIds?: string[] } : {}
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            deletedSessionIds: parsed.sessionIds ?? [],
            terminatedSessionIds: [SESSION_1.sessionId],
            skipped: [],
          }),
        })
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([SESSION_1, SESSION_2]),
      })
    }),
  )
  mockNavigate.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HistoryPage', () => {
  it('Test 1: on mount, fetches /api/sessions and renders session rows', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId(`session-row-${SESSION_1.sessionId}`)).toBeInTheDocument()
      expect(screen.getByTestId(`session-row-${SESSION_2.sessionId}`)).toBeInTheDocument()
    })
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/sessions'),
    )
  })

  it('Test 2: provider filter shows only claude sessions', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId(`session-row-${SESSION_1.sessionId}`)).toBeInTheDocument()
    })
    const providerSelect = screen.getByTestId('provider-filter')
    fireEvent.change(providerSelect, { target: { value: 'claude' } })
    expect(screen.getByTestId(`session-row-${SESSION_1.sessionId}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`session-row-${SESSION_2.sessionId}`)).not.toBeInTheDocument()
  })

  it('Test 3: status filter shows only ended sessions', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId(`session-row-${SESSION_1.sessionId}`)).toBeInTheDocument()
    })
    const statusSelect = screen.getByTestId('status-filter')
    fireEvent.change(statusSelect, { target: { value: 'ended' } })
    expect(screen.queryByTestId(`session-row-${SESSION_1.sessionId}`)).not.toBeInTheDocument()
    expect(screen.getByTestId(`session-row-${SESSION_2.sessionId}`)).toBeInTheDocument()
  })

  it('Test 4: project filter hides sessions from other paths', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId(`session-row-${SESSION_1.sessionId}`)).toBeInTheDocument()
    })
    const projectSelect = screen.getByTestId('project-filter')
    fireEvent.change(projectSelect, { target: { value: '/repos/alpha' } })
    expect(screen.getByTestId(`session-row-${SESSION_1.sessionId}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`session-row-${SESSION_2.sessionId}`)).not.toBeInTheDocument()
  })

  it('Test 5: date filter hides sessions older than 7 days', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId(`session-row-${SESSION_1.sessionId}`)).toBeInTheDocument()
      expect(screen.getByTestId(`session-row-${SESSION_2.sessionId}`)).toBeInTheDocument()
    })
    const dateSelect = screen.getByTestId('date-filter')
    fireEvent.change(dateSelect, { target: { value: '7d' } })
    // SESSION_1 is recent (today), SESSION_2 is 30 days ago — should be hidden
    expect(screen.getByTestId(`session-row-${SESSION_1.sessionId}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`session-row-${SESSION_2.sessionId}`)).not.toBeInTheDocument()
  })

  it('Test 6: clicking a session row calls setHistoryMode(true) and navigates to /session/:id/timeline', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId(`session-row-${SESSION_1.sessionId}`)).toBeInTheDocument()
    })
    const row = screen.getByTestId(`session-row-${SESSION_1.sessionId}`)
    // Click the button inside the row
    const button = row.querySelector('button')!
    fireEvent.click(button)
    expect(useStore.getState().historyMode).toBe(true)
    expect(mockNavigate).toHaveBeenCalledWith(`/session/${SESSION_1.sessionId}/timeline`)
  })

  it('Test 7: selecting two sessions and clicking compare toggles ComparePanel open/close', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId(`session-row-${SESSION_1.sessionId}`)).toBeInTheDocument()
    })
    const cb1 = screen.getByTestId(`selection-checkbox-${SESSION_1.sessionId}`)
    const cb2 = screen.getByTestId(`selection-checkbox-${SESSION_2.sessionId}`)
    await act(async () => {
      fireEvent.click(cb1)
      fireEvent.click(cb2)
    })
    const compareBtn = screen.getByTestId('compare-action')
    fireEvent.click(compareBtn)
    expect(screen.getByTestId('compare-container')).toBeInTheDocument()
    expect(screen.getByTestId('compare-panel')).toBeInTheDocument()

    fireEvent.click(compareBtn)
    await waitFor(() => {
      expect(screen.queryByTestId('compare-container')).not.toBeInTheDocument()
    })
  })

  it('Test 8: compare button starts disabled and enables with exactly two selected sessions', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId(`session-row-${SESSION_1.sessionId}`)).toBeInTheDocument()
    })
    const compareBtn = screen.getByTestId('compare-action') as HTMLButtonElement
    expect(compareBtn.disabled).toBe(true)

    fireEvent.click(screen.getByTestId(`selection-checkbox-${SESSION_1.sessionId}`))
    expect(compareBtn.disabled).toBe(true)

    fireEvent.click(screen.getByTestId(`selection-checkbox-${SESSION_2.sessionId}`))
    expect(compareBtn.disabled).toBe(false)
  })

  it('Test 9: deleting selected active session shows termination warning and removes row after confirm', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId(`session-row-${SESSION_1.sessionId}`)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId(`selection-checkbox-${SESSION_1.sessionId}`))
    fireEvent.click(screen.getByTestId('delete-selected'))

    expect(screen.getByTestId('delete-history-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('delete-active-warning')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('confirm-delete-history'))

    await waitFor(() => {
      expect(screen.queryByTestId(`session-row-${SESSION_1.sessionId}`)).not.toBeInTheDocument()
    })
  })

  it('Test 10: delete all removes all sessions from list', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId(`session-row-${SESSION_1.sessionId}`)).toBeInTheDocument()
      expect(screen.getByTestId(`session-row-${SESSION_2.sessionId}`)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('delete-all'))
    fireEvent.click(screen.getByTestId('confirm-delete-history'))

    await waitFor(() => {
      expect(screen.queryByTestId(`session-row-${SESSION_1.sessionId}`)).not.toBeInTheDocument()
      expect(screen.queryByTestId(`session-row-${SESSION_2.sessionId}`)).not.toBeInTheDocument()
    })
  })
})
