import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { useStore } from '../store/index.js'

const mockNavigate = vi.fn()

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  Outlet: () => <div data-testid="outlet" />,
  NavLink: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={String(to)}>{children}</a>
  ),
  useParams: () => ({}),
}))

// Render popup content inline in tests.
let mockDialogOnOpenChange: ((open: boolean) => void) | null = null
vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode }) => {
    mockDialogOnOpenChange = onOpenChange
    return open ? <div data-testid="dialog-root">{children}</div> : null
  },
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Overlay: () => <div data-testid="dialog-overlay" />,
  Content: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-content">{children}</div>,
  Close: ({ children }: { children: React.ReactNode }) =>
    <button onClick={() => mockDialogOnOpenChange?.(false)} aria-label="Close">{children}</button>,
  Title: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

vi.mock('@radix-ui/react-tabs', () => ({
  Root: ({ children }: { children: React.ReactNode }) => <div data-testid="tabs-root">{children}</div>,
  List: ({ children }: { children: React.ReactNode }) => <div role="tablist">{children}</div>,
  Trigger: ({ children, value }: { children: React.ReactNode; value: string }) =>
    <button role="tab" data-value={value}>{children}</button>,
  Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../components/panels/ApprovalInbox.js', () => ({ ApprovalInbox: () => <div>Approvals</div> }))
vi.mock('../components/panels/ChatPanel.js', () => ({ ChatPanel: () => <div>Chat</div> }))
vi.mock('../components/panels/TimelinePanel.js', () => ({ TimelinePanel: () => <div>Timeline</div> }))
vi.mock('../components/panels/DiffPanel.js', () => ({ DiffPanel: () => <div>Diff</div> }))
vi.mock('../components/panels/MemoryPanel.js', () => ({ MemoryPanel: () => <div>Memory</div> }))
vi.mock('../components/panels/ArtifactsPanel.js', () => ({ ArtifactsPanel: () => <div>Artifacts</div> }))

vi.mock('../hooks/useSessionEvents.js', () => ({
  sendWsMessage: vi.fn(),
}))

import { sendWsMessage } from '../hooks/useSessionEvents.js'
import { SessionListPanel } from '../components/layout/SessionListPanel.js'
import { InstancePopupHub } from '../components/office/InstancePopupHub.js'

const mockSendWsMessage = sendWsMessage as ReturnType<typeof vi.fn>

function makeSessionRecord(overrides: Record<string, unknown>) {
  return {
    sessionId: 'session-1',
    provider: 'claude',
    workspacePath: '/projects/alpha',
    startedAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    lastEventAt: '2026-01-01T00:01:00.000Z',
    pendingApprovals: 0,
    managedByDaemon: true,
    canSendMessage: true,
    canTerminateSession: true,
    ...overrides,
  }
}

describe('Session terminate controls', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockSendWsMessage.mockReset()
    mockSendWsMessage.mockReturnValue(true)
    useStore.setState({
      sessions: {},
      selectedSessionId: null,
      popupPreferredTab: null,
      wsStatus: 'connected',
      filters: { provider: null, status: null, search: '' },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends session_terminate from SessionListPanel for managed sessions', () => {
    useStore.setState({
      sessions: {
        'session-1': makeSessionRecord({}),
      },
    })

    render(<SessionListPanel />)
    fireEvent.click(screen.getByRole('button', { name: /terminate alpha/i }))
    fireEvent.click(screen.getByRole('button', { name: /terminate session/i }))

    expect(mockSendWsMessage).toHaveBeenCalledWith({
      type: 'session_terminate',
      sessionId: 'session-1',
    })
    expect(screen.getByRole('button', { name: /terminate alpha/i })).toHaveTextContent('Terminating...')
  })

  it('shows unsupported guidance and no terminate button for external sessions in SessionListPanel', () => {
    useStore.setState({
      sessions: {
        'session-2': makeSessionRecord({
          sessionId: 'session-2',
          workspacePath: '/projects/external',
          managedByDaemon: false,
          canSendMessage: false,
          canTerminateSession: false,
          reason: 'External session is approval-only; chat send and terminate are disabled.',
        }),
      },
    })

    render(<SessionListPanel />)

    expect(screen.queryByRole('button', { name: /terminate external/i })).not.toBeInTheDocument()
    expect(screen.getByText('External session is approval-only; chat send and terminate are disabled.')).toBeInTheDocument()
  })

  it('sends session_terminate from popup header for managed sessions', () => {
    useStore.setState({
      selectedSessionId: 'session-1',
      sessions: {
        'session-1': makeSessionRecord({}),
      },
    })

    render(<InstancePopupHub open={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /terminate/i }))
    fireEvent.click(screen.getByRole('button', { name: /terminate session/i }))

    expect(mockSendWsMessage).toHaveBeenCalledWith({
      type: 'session_terminate',
      sessionId: 'session-1',
    })
  })

  it('renders unsupported terminate guidance in popup for non-managed sessions', () => {
    useStore.setState({
      selectedSessionId: 'session-2',
      sessions: {
        'session-2': makeSessionRecord({
          sessionId: 'session-2',
          managedByDaemon: false,
          canSendMessage: false,
          canTerminateSession: false,
          reason: 'External session is approval-only; chat send and terminate are disabled.',
        }),
      },
    })

    render(<InstancePopupHub open={true} onClose={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /terminate/i })).not.toBeInTheDocument()
    expect(screen.getByText('External session is approval-only; chat send and terminate are disabled.')).toBeInTheDocument()
  })

  it('shows daemon-connection error when terminate is clicked while disconnected', () => {
    useStore.setState({
      wsStatus: 'disconnected',
      sessions: {
        'session-1': makeSessionRecord({}),
      },
    })

    render(<SessionListPanel />)
    fireEvent.click(screen.getByRole('button', { name: /terminate alpha/i }))

    expect(screen.getByText('Daemon connection is not open. Reconnect and try again.')).toBeInTheDocument()
    expect(mockSendWsMessage).not.toHaveBeenCalled()
  })
})
