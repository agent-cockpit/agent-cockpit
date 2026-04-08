import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { useStore } from '../store/index.js'
import { ApprovalInbox } from '../components/panels/ApprovalInbox.js'
import type { PendingApproval } from '../store/approvalsSlice.js'

const SESSION_ID = '00000000-0000-0000-0000-000000000001'

// ─── Mock sendWsMessage ───────────────────────────────────────────────────────

vi.mock('../hooks/useSessionEvents.js', () => ({
  sendWsMessage: vi.fn(),
  connectDaemon: vi.fn(),
  useSessionEvents: vi.fn(),
}))

// Import after mock is defined
const { sendWsMessage } = await import('../hooks/useSessionEvents.js')
const mockSendWsMessage = sendWsMessage as ReturnType<typeof vi.fn>

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeApproval(overrides: Partial<PendingApproval> = {}): PendingApproval {
  return {
    approvalId: 'appr-001',
    sessionId: SESSION_ID,
    actionType: 'shell_command',
    riskLevel: 'high',
    proposedAction: 'rm -rf /tmp',
    affectedPaths: ['/tmp'],
    whyRisky: 'Deletes files',
    timestamp: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderInbox(sessionId: string = SESSION_ID) {
  render(
    <MemoryRouter initialEntries={[`/session/${sessionId}/approvals`]}>
      <Routes>
        <Route path="/session/:sessionId/approvals" element={<ApprovalInbox />} />
      </Routes>
    </MemoryRouter>,
  )
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  useStore.setState({
    pendingApprovalsBySession: {},
    wsStatus: 'connected',
  })
  mockSendWsMessage.mockClear()
})

// ─── APPR-01: Empty state ─────────────────────────────────────────────────────

describe('APPR-01: Empty state', () => {
  it('renders "No pending approvals" when pendingApprovalsBySession is empty', () => {
    useStore.setState({ pendingApprovalsBySession: {} })
    renderInbox()
    expect(screen.getByText(/No pending approvals/i)).toBeInTheDocument()
  })
})

// ─── APPR-01 + APPR-02 + APPR-04: Approval card rendering ────────────────────

describe('APPR-02 + APPR-04: Approval card detail fields', () => {
  it('approval card shows actionType label (formatted as "Shell Command")', () => {
    useStore.setState({
      pendingApprovalsBySession: { [SESSION_ID]: [makeApproval()] },
    })
    renderInbox()
    expect(screen.getByText('Shell Command')).toBeInTheDocument()
  })

  it('approval card shows riskLevel badge', () => {
    useStore.setState({
      pendingApprovalsBySession: { [SESSION_ID]: [makeApproval()] },
    })
    renderInbox()
    expect(screen.getByText('high')).toBeInTheDocument()
  })

  it('approval card shows proposedAction text', () => {
    useStore.setState({
      pendingApprovalsBySession: { [SESSION_ID]: [makeApproval()] },
    })
    renderInbox()
    expect(screen.getByText('rm -rf /tmp')).toBeInTheDocument()
  })

  it('approval card shows affectedPaths', () => {
    useStore.setState({
      pendingApprovalsBySession: { [SESSION_ID]: [makeApproval()] },
    })
    renderInbox()
    expect(screen.getByText('/tmp')).toBeInTheDocument()
  })

  it('approval card shows whyRisky text', () => {
    useStore.setState({
      pendingApprovalsBySession: { [SESSION_ID]: [makeApproval()] },
    })
    renderInbox()
    expect(screen.getByText('Deletes files')).toBeInTheDocument()
  })
})

// ─── APPR-03: Decision buttons call sendWsMessage ────────────────────────────

describe('APPR-03: Decision buttons call sendWsMessage with correct payload', () => {
  it('clicking Approve sends { type: "approval_decision", approvalId, decision: "approve" }', () => {
    useStore.setState({
      pendingApprovalsBySession: { [SESSION_ID]: [makeApproval()] },
    })
    renderInbox()
    fireEvent.click(screen.getByRole('button', { name: /approve/i }))
    expect(mockSendWsMessage).toHaveBeenCalledWith({
      type: 'approval_decision',
      approvalId: 'appr-001',
      decision: 'approve',
    })
  })

  it('clicking Deny sends { type: "approval_decision", approvalId, decision: "deny" }', () => {
    useStore.setState({
      pendingApprovalsBySession: { [SESSION_ID]: [makeApproval()] },
    })
    renderInbox()
    fireEvent.click(screen.getByRole('button', { name: /deny/i }))
    expect(mockSendWsMessage).toHaveBeenCalledWith({
      type: 'approval_decision',
      approvalId: 'appr-001',
      decision: 'deny',
    })
  })

  it('clicking Always Allow sends { type: "approval_decision", approvalId, decision: "always_allow" }', () => {
    useStore.setState({
      pendingApprovalsBySession: { [SESSION_ID]: [makeApproval()] },
    })
    renderInbox()
    fireEvent.click(screen.getByRole('button', { name: /always allow/i }))
    expect(mockSendWsMessage).toHaveBeenCalledWith({
      type: 'approval_decision',
      approvalId: 'appr-001',
      decision: 'always_allow',
    })
  })
})

// ─── APPR-03: Optimistic removal after decision ───────────────────────────────

describe('APPR-03: Optimistic removal', () => {
  it('approval card is removed from DOM after clicking a decision button', () => {
    useStore.setState({
      pendingApprovalsBySession: { [SESSION_ID]: [makeApproval()] },
    })
    renderInbox()
    expect(screen.getByText('rm -rf /tmp')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /approve/i }))
    expect(screen.queryByText('rm -rf /tmp')).not.toBeInTheDocument()
  })
})

// ─── APPR-03: Button disabled state based on wsStatus ────────────────────────

describe('APPR-03: Buttons disabled when disconnected', () => {
  it('all three decision buttons are disabled when wsStatus is "disconnected"', () => {
    useStore.setState({
      pendingApprovalsBySession: { [SESSION_ID]: [makeApproval()] },
      wsStatus: 'disconnected',
    })
    renderInbox()
    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /deny/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /always allow/i })).toBeDisabled()
  })

  it('all three decision buttons are enabled when wsStatus is "connected"', () => {
    useStore.setState({
      pendingApprovalsBySession: { [SESSION_ID]: [makeApproval()] },
      wsStatus: 'connected',
    })
    renderInbox()
    expect(screen.getByRole('button', { name: /approve/i })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /deny/i })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /always allow/i })).not.toBeDisabled()
  })
})
