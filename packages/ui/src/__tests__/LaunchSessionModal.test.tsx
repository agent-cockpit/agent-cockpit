/**
 * LaunchSessionModal tests — covers the waiting_for_session_start state,
 * WebSocket-driven session detection, 30s timeout, and absence of copy-command UI.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useStore } from '../store/index.js'

vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
  Outlet: () => <div data-testid="outlet" />,
  NavLink: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={String(to)}>{children}</a>
  ),
  useParams: () => ({}),
}))

import { LaunchSessionModal } from '../components/sessions/LaunchSessionModal.js'

const MOCK_SESSION_ID = 'test-uuid-launched-1'

function renderModal(onClose = vi.fn()) {
  return render(<LaunchSessionModal open={true} onClose={onClose} />)
}

async function submitForm(workspacePath = '/tmp/test-cockpit') {
  const workspaceInput = screen.getByLabelText(/workspace path/i)
  fireEvent.change(workspaceInput, { target: { value: workspacePath } })
  const form = workspaceInput.closest('form')!
  fireEvent.submit(form)
}

beforeEach(() => {
  useStore.setState({
    sessions: {},
    selectedSessionId: null,
    activePanel: 'approvals',
    filters: { provider: null, status: null, search: '' },
  })
  vi.resetAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('LaunchSessionModal — waiting state', () => {
  it('shows waiting state text after POST returns mode=initiated', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ sessionId: MOCK_SESSION_ID, mode: 'initiated' }),
    } as Response)

    renderModal()
    await submitForm()

    expect(await screen.findByText(/waiting for session to start/i)).toBeInTheDocument()
  })

  it('does NOT render copy-command / hookCommand UI at any point', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ sessionId: MOCK_SESSION_ID, mode: 'initiated' }),
    } as Response)

    renderModal()
    await submitForm()

    await screen.findByText(/waiting for session to start/i)
    expect(screen.queryByText(/run this command in your terminal/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /copy/i })).not.toBeInTheDocument()
  })

  it('calls onClose when sessions store gains the launched sessionId', async () => {
    const onClose = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ sessionId: MOCK_SESSION_ID, mode: 'initiated' }),
    } as Response)

    renderModal(onClose)
    await submitForm()
    await screen.findByText(/waiting for session to start/i)

    // Simulate session_start arriving via store update
    act(() => {
      useStore.setState({
        sessions: {
          [MOCK_SESSION_ID]: {
            sessionId: MOCK_SESSION_ID,
            provider: 'codex',
            workspacePath: '/tmp/test-cockpit',
            startedAt: new Date().toISOString(),
            status: 'active',
            lastEventAt: new Date().toISOString(),
            pendingApprovals: 0,
          },
        },
      })
    })

    expect(onClose).toHaveBeenCalled()
  })

  it('shows session ID in waiting state', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ sessionId: MOCK_SESSION_ID, mode: 'initiated' }),
    } as Response)

    renderModal()
    await submitForm()
    await screen.findByText(/waiting for session to start/i)

    expect(screen.getByText(new RegExp(MOCK_SESSION_ID))).toBeInTheDocument()
  })
})

describe('LaunchSessionModal — timeout', () => {
  it('shows timed out error after 30000ms with no session_start', async () => {
    // Must set up fake timers BEFORE rendering so setTimeout in useEffect uses fake clock
    vi.useFakeTimers({ shouldAdvanceTime: false })

    let resolveFetch!: (value: string) => void
    const fetchBodyPromise = new Promise<string>((res) => { resolveFetch = res })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => fetchBodyPromise,
    } as unknown as Response)

    renderModal()

    // Submit form
    fireEvent.change(screen.getByLabelText(/workspace path/i), { target: { value: '/tmp/test' } })
    const form = screen.getByLabelText(/workspace path/i).closest('form')!
    fireEvent.submit(form)

    // Resolve the fetch while running all pending microtasks
    await act(async () => {
      resolveFetch(JSON.stringify({ sessionId: MOCK_SESSION_ID, mode: 'initiated' }))
      // Flush microtasks (promises)
      await Promise.resolve()
      await Promise.resolve()
    })

    // The component should now be in waiting_for_session_start state
    expect(screen.getByText(/waiting for session to start/i)).toBeInTheDocument()

    // Advance fake clock past 30 seconds to trigger timeout
    act(() => {
      vi.advanceTimersByTime(30001)
    })

    expect(screen.getByText(/timed out/i)).toBeInTheDocument()
  })
})
