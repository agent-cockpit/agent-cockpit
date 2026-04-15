import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// Hoist mockSendWsMessage before imports
const { mockSendWsMessage } = vi.hoisted(() => ({
  mockSendWsMessage: vi.fn(),
}))

// Mock sendWsMessage before importing ApprovalInbox
vi.mock('../../../hooks/useSessionEvents.js', () => ({
  sendWsMessage: mockSendWsMessage,
  connectDaemon: vi.fn(),
}))

// Mock store with selectedSessionId set (popup context pattern)
const mockStore = {
  selectedSessionId: 'popup-session-123',
  sessions: {
    'popup-session-123': {
      sessionId: 'popup-session-123',
      workspacePath: '/home/user/popup-project',
      provider: 'claude',
      status: 'active',
      startedAt: 0,
    }
  },
  wsStatus: 'connected',
  pendingApprovalsBySession: {
    'popup-session-123': [
      {
        approvalId: 'approval-1',
        sessionId: 'popup-session-123',
        actionType: 'bash_command',
        riskLevel: 'medium',
        proposedAction: 'npm install',
        affectedPaths: [],
        whyRisky: 'Installs packages from npm',
        timestamp: new Date().toISOString(),
      }
    ]
  },
}

vi.mock('../../../store/index.js', () => ({
  useStore: (selector: (s: typeof mockStore) => unknown) => {
    // Simulate how Zustand selectors work
    return selector(mockStore)
  },
}))

// Import ApprovalInbox after all mocks are set up
import { ApprovalInbox } from '../../panels/ApprovalInbox.js'

describe('ApprovalInbox in popup context (approvals-regression)', () => {
  beforeEach(() => {
    mockSendWsMessage.mockClear()
  })

  it('uses store-selected sessionId when URL params are absent (popup context)', () => {
    render(<ApprovalInbox />)

    // Verify store.selectedSessionId is used (no useParams in popup)
    expect(mockStore.selectedSessionId).toBe('popup-session-123')
    // ApprovalInbox should read pendingApprovalsBySession[selectedSessionId]
    expect(screen.getByText('npm install')).toBeInTheDocument()
    expect(screen.getByText('Bash Command')).toBeInTheDocument()
  })

  it('approve button triggers sendWsMessage with correct payload', async () => {
    render(<ApprovalInbox />)

    // Debug: check if approvals are rendered
    const approvalText = screen.getByText('npm install')
    expect(approvalText).toBeInTheDocument()

    const approveButton = screen.getByRole('button', { name: /approve/i })
    expect(approveButton).toBeInTheDocument()

    // Buttons should be enabled when wsStatus === 'connected'
    expect(approveButton).not.toBeDisabled()

    fireEvent.click(approveButton)

    await waitFor(() => {
      expect(mockSendWsMessage).toHaveBeenCalledTimes(1)
      expect(mockSendWsMessage).toHaveBeenCalledWith({
        type: 'approval_decision',
        approvalId: 'approval-1',
        decision: 'approve',
      })
    })
  })

  it('deny button triggers sendWsMessage with correct payload', async () => {
    render(<ApprovalInbox />)

    const denyButton = screen.getByRole('button', { name: /deny/i })
    expect(denyButton).toBeInTheDocument()

    fireEvent.click(denyButton)

    await waitFor(() => {
      expect(mockSendWsMessage).toHaveBeenCalledTimes(1)
      expect(mockSendWsMessage).toHaveBeenCalledWith({
        type: 'approval_decision',
        approvalId: 'approval-1',
        decision: 'deny',
      })
    })
  })

  it('buttons are disabled when wsStatus is not connected', () => {
    // Mock wsStatus as disconnected
    mockStore.wsStatus = 'disconnected'

    render(<ApprovalInbox />)

    const approveButton = screen.getByRole('button', { name: /approve/i })
    const denyButton = screen.getByRole('button', { name: /deny/i })

    expect(approveButton).toBeDisabled()
    expect(denyButton).toBeDisabled()

    // No sendWsMessage calls when disabled
    fireEvent.click(approveButton)
    expect(mockSendWsMessage).not.toHaveBeenCalled()
  })
})
