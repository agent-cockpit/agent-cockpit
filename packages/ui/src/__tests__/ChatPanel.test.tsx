import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ChatPanel } from '../components/panels/ChatPanel.js'
import { useStore } from '../store/index.js'

vi.mock('../hooks/useSessionEvents.js', () => ({
  sendWsMessage: vi.fn(),
  connectDaemon: vi.fn(),
  useSessionEvents: vi.fn(),
}))

const { sendWsMessage } = await import('../hooks/useSessionEvents.js')
const mockSendWsMessage = sendWsMessage as ReturnType<typeof vi.fn>

const SESSION_ID = '00000000-0000-0000-0000-000000000777'

function seedStore(overrides: Record<string, unknown> = {}) {
  useStore.setState({
    selectedSessionId: SESSION_ID,
    wsStatus: 'connected',
    sessions: {
      [SESSION_ID]: {
        sessionId: SESSION_ID,
        provider: 'codex',
        workspacePath: '/workspace/project-chat',
        startedAt: '2026-04-14T00:00:00.000Z',
        status: 'active',
        lastEventAt: '2026-04-14T00:00:00.000Z',
        pendingApprovals: 0,
        managedByDaemon: true,
        canSendMessage: true,
        canTerminateSession: true,
      },
    },
    events: {
      [SESSION_ID]: [
        {
          schemaVersion: 1,
          sessionId: SESSION_ID,
          timestamp: '2026-04-14T00:00:00.000Z',
          type: 'session_chat_message',
          provider: 'codex',
          role: 'assistant',
          content: 'Welcome to the chat.',
        },
      ],
    },
    ...overrides,
  })
}

describe('ChatPanel', () => {
  beforeEach(() => {
    mockSendWsMessage.mockClear()
    seedStore()
  })

  it('renders chat history and sends session_chat for managed sessions', () => {
    render(<ChatPanel />)

    expect(screen.getByText('Welcome to the chat.')).toBeInTheDocument()

    const input = screen.getByPlaceholderText(/send a message/i)
    fireEvent.change(input, { target: { value: 'Run tests now' } })

    const sendButton = screen.getByRole('button', { name: /send/i })
    fireEvent.click(sendButton)

    expect(mockSendWsMessage).toHaveBeenCalledWith({
      type: 'session_chat',
      sessionId: SESSION_ID,
      content: 'Run tests now',
    })
  })

  it('shows explicit approval-only disabled state for external sessions', () => {
    seedStore({
      sessions: {
        [SESSION_ID]: {
          sessionId: SESSION_ID,
          provider: 'claude',
          workspacePath: '/workspace/external',
          startedAt: '2026-04-14T00:00:00.000Z',
          status: 'active',
          lastEventAt: '2026-04-14T00:00:00.000Z',
          pendingApprovals: 0,
          managedByDaemon: false,
          canSendMessage: false,
          canTerminateSession: false,
          reason: 'External session is approval-only; chat send and terminate are disabled.',
        },
      },
    })

    render(<ChatPanel />)

    expect(screen.getByText('This session is approval-only and does not support chat sends.')).toBeInTheDocument()
    expect(screen.getByText('External session is approval-only; chat send and terminate are disabled.')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/send a message/i)).not.toBeInTheDocument()
  })

  it('surfaces daemon rejection reason from session_chat_error events', () => {
    seedStore({
      events: {
        [SESSION_ID]: [
          {
            schemaVersion: 1,
            sessionId: SESSION_ID,
            timestamp: '2026-04-14T00:00:00.000Z',
            type: 'session_chat_error',
            provider: 'codex',
            reasonCode: 'CHAT_SEND_BLOCKED',
            reason: 'Managed session runtime is not available for chat send.',
          },
        ],
      },
    })

    render(<ChatPanel />)

    expect(screen.getByText('Managed session runtime is not available for chat send.')).toBeInTheDocument()
  })

  it('locks composer and shows typing status until assistant reply arrives', async () => {
    render(<ChatPanel />)

    const input = screen.getByPlaceholderText(/send a message/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Ping provider' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))

    expect(screen.getByText('Codex is typing...')).toBeInTheDocument()
    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()

    act(() => {
      useStore.setState((state) => ({
        events: {
          ...state.events,
          [SESSION_ID]: [
            ...(state.events[SESSION_ID] ?? []),
            {
              schemaVersion: 1,
              sessionId: SESSION_ID,
              timestamp: new Date(Date.now() + 1000).toISOString(),
              type: 'session_chat_message',
              provider: 'codex',
              role: 'assistant',
              content: 'Reply from provider',
            },
          ],
        },
      }))
    })

    await waitFor(() => {
      expect(screen.queryByText('Codex is typing...')).not.toBeInTheDocument()
      expect(input).not.toBeDisabled()
    })
  })
})
