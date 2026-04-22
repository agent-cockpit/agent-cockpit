import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
  Outlet: () => <div data-testid="outlet" />,
  NavLink: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={String(to)}>{children}</a>
  ),
  useParams: () => ({}),
}))

import { LaunchSessionModal } from '../components/sessions/LaunchSessionModal.js'

function renderModal(onClose = vi.fn()) {
  return render(<LaunchSessionModal open={true} onClose={onClose} />)
}

async function submitForm(workspacePath = '/tmp/test-cockpit') {
  const workspaceInput = screen.getByLabelText(/workspace path/i)
  fireEvent.change(workspaceInput, { target: { value: workspacePath } })
  const form = workspaceInput.closest('form')!
  fireEvent.submit(form)
}

function getLaunchPayload() {
  const fetchMock = global.fetch as ReturnType<typeof vi.fn>
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return JSON.parse(String(init.body)) as Record<string, unknown>
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('LaunchSessionModal', () => {
  it('closes immediately after a successful launch response', async () => {
    const onClose = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ sessionId: 'test-session-id', mode: 'initiated' }),
    } as Response)

    renderModal(onClose)
    await submitForm()

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    const payload = getLaunchPayload()
    expect(payload.provider).toBe('claude')
    expect(payload.permissionMode).toBe('default')
  })

  it('submits selected permissionMode for Claude launches', async () => {
    const onClose = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ sessionId: 'test-session-id', mode: 'initiated' }),
    } as Response)

    renderModal(onClose)
    const permissionSelect = screen.getByLabelText(/permission level/i)
    fireEvent.change(permissionSelect, { target: { value: 'dangerously_skip' } })
    await submitForm()

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    const payload = getLaunchPayload()
    expect(payload.permissionMode).toBe('dangerously_skip')
  })

  it('does not render copy-command UI', () => {
    renderModal()

    expect(screen.queryByText(/run this command in your terminal/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /copy/i })).not.toBeInTheDocument()
  })

  it('shows daemon error message for a failed launch response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => JSON.stringify({ error: 'Workspace path does not exist' }),
    } as Response)

    renderModal()
    await submitForm('/nope')

    expect(await screen.findByText(/workspace path does not exist/i)).toBeInTheDocument()
  })

  it('shows a non-JSON response error when daemon returns invalid body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'not-json',
      status: 200,
    } as Response)

    renderModal()
    await submitForm()

    expect(await screen.findByText(/daemon returned non-json response/i)).toBeInTheDocument()
  })
})
