import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import type { SessionRecord } from '../../../store/index.js'

let mockSessions: SessionRecord[] = []
let selectedSessionId: string | null = null
const selectSessionSpy = vi.fn()

vi.mock('../../../store/selectors.js', () => ({
  useActiveSessions: () => mockSessions,
}))

vi.mock('../../../store/index.js', () => ({
  useStore: (selector: (state: { selectedSessionId: string | null; selectSession: (id: string) => void }) => unknown) =>
    selector({
      selectedSessionId,
      selectSession: selectSessionSpy,
    }),
}))

import { MapSidebar } from '../MapSidebar.js'

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const sessionId = overrides.sessionId ?? 'session-default'
  return {
    sessionId,
    provider: overrides.provider ?? 'claude',
    workspacePath: overrides.workspacePath ?? `/tmp/${sessionId}`,
    startedAt: overrides.startedAt ?? '2026-04-13T00:00:00.000Z',
    status: overrides.status ?? 'active',
    lastEventAt: overrides.lastEventAt ?? '2026-04-13T00:00:00.000Z',
    pendingApprovals: overrides.pendingApprovals ?? 0,
  }
}

describe('MapSidebar', () => {
  beforeEach(() => {
    mockSessions = []
    selectedSessionId = null
    selectSessionSpy.mockReset()
  })

  it('renders rows in lastEventAt descending order', () => {
    mockSessions = [
      makeSession({
        sessionId: 'session-old',
        workspacePath: '/workspace/old',
        lastEventAt: '2026-04-11T12:00:00.000Z',
      }),
      makeSession({
        sessionId: 'session-new',
        workspacePath: '/workspace/new',
        lastEventAt: '2026-04-13T11:00:00.000Z',
      }),
      makeSession({
        sessionId: 'session-mid',
        workspacePath: '/workspace/mid',
        lastEventAt: '2026-04-12T18:30:00.000Z',
      }),
    ]

    render(<MapSidebar onFocusSession={vi.fn()} />)

    const rowButtons = screen.getAllByRole('button')
    expect(within(rowButtons[0]!).getByText('new')).toBeInTheDocument()
    expect(within(rowButtons[1]!).getByText('mid')).toBeInTheDocument()
    expect(within(rowButtons[2]!).getByText('old')).toBeInTheDocument()
  })

  it('renders provider badge, status text, and status dot semantics', () => {
    mockSessions = [
      makeSession({ sessionId: 'session-active', workspacePath: '/workspace/alpha', status: 'active', provider: 'claude' }),
      makeSession({ sessionId: 'session-ended', workspacePath: '/workspace/beta', status: 'ended', provider: 'codex' }),
      makeSession({ sessionId: 'session-error', workspacePath: '/workspace/gamma', status: 'error', provider: 'claude' }),
    ]

    render(<MapSidebar onFocusSession={vi.fn()} />)

    const activeRow = screen.getByRole('button', { name: /alpha/i })
    expect(within(activeRow).getByText('Claude')).toBeInTheDocument()
    expect(within(activeRow).getByText('Active')).toBeInTheDocument()
    expect(within(activeRow).getByTestId('status-dot')).toHaveAttribute('data-status', 'active')
    expect(within(activeRow).queryByTestId('secondary-metadata')).not.toBeInTheDocument()

    const endedRow = screen.getByRole('button', { name: /beta/i })
    expect(within(endedRow).getByText('Codex')).toBeInTheDocument()
    expect(within(endedRow).getByText('Ended')).toBeInTheDocument()
    expect(within(endedRow).getByTestId('status-dot')).toHaveAttribute('data-status', 'ended')
    expect(within(endedRow).getByTestId('secondary-metadata')).toBeInTheDocument()

    const errorRow = screen.getByRole('button', { name: /gamma/i })
    expect(within(errorRow).getByText('Claude')).toBeInTheDocument()
    expect(within(errorRow).getByText('Error')).toBeInTheDocument()
    expect(within(errorRow).getByTestId('status-dot')).toHaveAttribute('data-status', 'error')
    expect(within(errorRow).getByTestId('secondary-metadata')).toBeInTheDocument()
  })

  it('shows pending approvals numeric pill only when pendingApprovals is greater than zero', () => {
    mockSessions = [
      makeSession({
        sessionId: 'session-with-pending',
        workspacePath: '/workspace/with-pending',
        pendingApprovals: 3,
      }),
      makeSession({
        sessionId: 'session-without-pending',
        workspacePath: '/workspace/without-pending',
        pendingApprovals: 0,
      }),
    ]

    render(<MapSidebar onFocusSession={vi.fn()} />)

    const withPendingRow = screen.getByRole('button', { name: /with-pending/i })
    expect(within(withPendingRow).getByTestId('pending-approvals-pill')).toHaveTextContent('3')

    const withoutPendingRow = screen.getByRole('button', { name: /without-pending/i })
    expect(within(withoutPendingRow).queryByTestId('pending-approvals-pill')).not.toBeInTheDocument()
  })

  it('clicking a row selects session and focuses it on the map', () => {
    mockSessions = [
      makeSession({
        sessionId: 'session-click-target',
        workspacePath: '/workspace/click-target',
      }),
    ]
    const onFocusSession = vi.fn()

    render(<MapSidebar onFocusSession={onFocusSession} />)

    const row = screen.getByRole('button', { name: /click-target/i })
    fireEvent.click(row)

    expect(selectSessionSpy).toHaveBeenCalledWith('session-click-target')
    expect(onFocusSession).toHaveBeenCalledWith('session-click-target')
  })

  it('renders empty state when there are no sessions', () => {
    mockSessions = []

    render(<MapSidebar onFocusSession={vi.fn()} />)

    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText('No active agents')).toBeInTheDocument()
  })
})
