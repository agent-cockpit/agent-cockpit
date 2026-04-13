/**
 * SessionListPanel tests — tests session card rendering, launch modal,
 * and selectSession behavior.
 *
 * Uses the memoized useFilteredSessions (useRef-based cache) to avoid the
 * React 18 useSyncExternalStore infinite-loop issue documented in selectors.test.ts.
 * useNavigate is mocked so no Router context is required.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useStore } from '../store/index.js'
import type { SessionRecord } from '../store/index.js'

const mockNavigate = vi.fn()

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  Outlet: () => <div data-testid="outlet" />,
  NavLink: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={String(to)}>{children}</a>
  ),
  useParams: () => ({}),
}))

import { SessionListPanel } from '../components/layout/SessionListPanel.js'

function makeSession(overrides: Partial<SessionRecord> & Pick<SessionRecord, 'sessionId'>): SessionRecord {
  return {
    provider: 'claude',
    workspacePath: '/projects/my-project',
    startedAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    lastEventAt: '2026-01-01T00:01:00.000Z',
    pendingApprovals: 0,
    ...overrides,
  }
}

beforeEach(() => {
  mockNavigate.mockClear()
  useStore.setState({
    sessions: {},
    selectedSessionId: null,
    activePanel: 'approvals',
    filters: { provider: null, status: null, search: '' },
  })
})

describe('SessionListPanel', () => {
  it('renders SessionCard for each session in the store', () => {
    useStore.setState({
      sessions: {
        a: makeSession({ sessionId: 'a', workspacePath: '/projects/alpha' }),
        b: makeSession({ sessionId: 'b', workspacePath: '/projects/beta', provider: 'codex' }),
      },
      filters: { provider: null, status: null, search: '' },
    })
    render(<SessionListPanel />)
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('beta')).toBeInTheDocument()
  })

  it('shows "No sessions" empty state when list is empty', () => {
    render(<SessionListPanel />)
    expect(screen.getByText(/no sessions/i)).toBeInTheDocument()
  })

  it('clicking a SessionCard calls selectSession with that session id', () => {
    useStore.setState({
      sessions: { a: makeSession({ sessionId: 'a', workspacePath: '/projects/alpha' }) },
      filters: { provider: null, status: null, search: '' },
    })
    render(<SessionListPanel />)
    fireEvent.click(screen.getByText('alpha'))
    expect(useStore.getState().selectedSessionId).toBe('a')
  })

  it('clicking a SessionCard calls navigate to /session/:id/approvals', () => {
    useStore.setState({
      sessions: { a: makeSession({ sessionId: 'a', workspacePath: '/projects/alpha' }) },
      filters: { provider: null, status: null, search: '' },
    })
    render(<SessionListPanel />)
    fireEvent.click(screen.getByText('alpha'))
    expect(mockNavigate).toHaveBeenCalledWith('/session/a/approvals')
  })

  it('Launch Session button is visible', () => {
    render(<SessionListPanel />)
    expect(screen.getByRole('button', { name: /launch session/i })).toBeInTheDocument()
  })

  it('clicking Launch Session button opens LaunchSessionModal (open=true)', () => {
    render(<SessionListPanel />)
    fireEvent.click(screen.getByRole('button', { name: /launch session/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('clicking Close on modal hides it (open=false)', () => {
    render(<SessionListPanel />)
    fireEvent.click(screen.getByRole('button', { name: /launch session/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

const LAUNCH_SESSION_ID = 'integration-session-uuid-1'

describe('LaunchSessionModal — panel integration', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  it('submitted form with valid workspace path enters waiting state (mock fetch)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ sessionId: LAUNCH_SESSION_ID, mode: 'initiated' }),
    } as Response)

    render(<SessionListPanel />)
    fireEvent.click(screen.getByRole('button', { name: /launch session/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    const workspaceInput = screen.getByLabelText(/workspace path/i)
    fireEvent.change(workspaceInput, { target: { value: '/tmp/test-cockpit' } })
    fireEvent.submit(workspaceInput.closest('form')!)

    expect(await screen.findByText(/waiting for session to start/i)).toBeInTheDocument()
  })

  it('when session_start arrives, session appears in panel list and modal closes', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ sessionId: LAUNCH_SESSION_ID, mode: 'initiated' }),
    } as Response)

    render(<SessionListPanel />)
    fireEvent.click(screen.getByRole('button', { name: /launch session/i }))

    const workspaceInput = screen.getByLabelText(/workspace path/i)
    fireEvent.change(workspaceInput, { target: { value: '/tmp/integration-test' } })
    fireEvent.submit(workspaceInput.closest('form')!)

    await screen.findByText(/waiting for session to start/i)

    // Simulate session_start WebSocket event arriving → session added to store
    act(() => {
      useStore.setState({
        sessions: {
          [LAUNCH_SESSION_ID]: makeSession({
            sessionId: LAUNCH_SESSION_ID,
            workspacePath: '/tmp/integration-test',
            provider: 'codex',
          }),
        },
      })
    })

    // Modal should close (no dialog) and session should appear in panel
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('integration-test')).toBeInTheDocument()
  })
})
