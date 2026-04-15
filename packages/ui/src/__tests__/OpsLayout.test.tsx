/**
 * OpsLayout layout shell tests — verifies two-column structure.
 * MapSidebar is mocked to avoid Zustand/React-18 snapshot
 * caching issues (documented in selectors.test.ts).
 * Behavioral tests (session rows, focus callback) live in MapSidebar.test.tsx.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useStore } from '../store/index.js'
import type { SessionRecord } from '../store/index.js'

// Mock react-router: OpsLayout uses Outlet only
vi.mock('react-router', () => ({
  Outlet: () => <div data-testid="outlet" />,
}))

// Mock MapSidebar so we test only OpsLayout shell structure here.
vi.mock('../components/layout/MapSidebar.js', () => ({
  MapSidebar: () => (
    <div data-testid="map-sidebar">
      <span>Active Agents</span>
    </div>
  ),
}))

// Mock HistoryPopup
vi.mock('../components/office/HistoryPopup.js', () => ({
  HistoryPopup: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <div data-testid="history-popup">History</div> : null,
}))

import { OpsLayout } from '../components/layout/OpsLayout.js'

function makeSession(overrides: Partial<SessionRecord> & Pick<SessionRecord, 'sessionId'>): SessionRecord {
  return {
    provider: 'claude',
    workspacePath: '/projects/my-project',
    startedAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    lastEventAt: '2026-01-01T00:01:00.000Z',
    pendingApprovals: 0,
    character: 'astronaut',
    ...overrides,
  }
}

const SESSION_A = makeSession({ sessionId: 'a', workspacePath: '/projects/alpha' })
const SESSION_B = makeSession({ sessionId: 'b', workspacePath: '/projects/beta', provider: 'codex' })

beforeEach(() => {
  useStore.setState({
    sessions: {},
    selectedSessionId: null,
    activePanel: 'approvals',
    filters: { provider: null, status: null, search: '' },
  })
})

describe('OpsLayout', () => {
  it('renders a map sidebar and a main content area', () => {
    render(<OpsLayout />)
    expect(screen.getByRole('complementary')).toBeInTheDocument() // <aside>
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('renders MapSidebar inside sidebar', () => {
    render(<OpsLayout />)
    expect(screen.getByTestId('map-sidebar')).toBeInTheDocument()
  })

  it('renders Agent Cockpit heading in sidebar', () => {
    render(<OpsLayout />)
    expect(screen.getByText('Agent Cockpit')).toBeInTheDocument()
  })

  it('renders a History button in the top bar', () => {
    render(<OpsLayout />)
    expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument()
  })

  it('HistoryPopup is not visible by default', () => {
    render(<OpsLayout />)
    expect(screen.queryByTestId('history-popup')).not.toBeInTheDocument()
  })

  it('sessions in store do not break layout', () => {
    useStore.setState({ sessions: { a: SESSION_A, b: SESSION_B } })
    render(<OpsLayout />)
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})
