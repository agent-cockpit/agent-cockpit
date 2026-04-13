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
    vi.useFakeTimers()

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ sessionId: MOCK_SESSION_ID, mode: 'initiated' }),
    } as Response)

    renderModal()

    // Submit and wait for async fetch
    await act(async () => {
      await submitForm()
    })

    await screen.findByText(/waiting for session to start/i)

    // Advance timers past 30s
    act(() => {
      vi.advanceTimersByTime(30001)
    })

    expect(screen.getByText(/timed out/i)).toBeInTheDocument()
  })
})
