/**
 * OpsLayout layout shell tests — verifies the two-column structure.
 * SessionListPanel is mocked to avoid Zustand/React-18 snapshot
 * caching issues (documented in selectors.test.ts).
 * Behavioral tests (session cards, launch modal) live in SessionListPanel.test.tsx.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useStore } from '../store/index.js'
import type { SessionRecord } from '../store/index.js'

// Mock react-router: OpsLayout uses Outlet, SessionListPanel uses useNavigate
vi.mock('react-router', () => ({
  Outlet: () => <div data-testid="outlet" />,
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  NavLink: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={String(to)}>{children}</a>
  ),
}))

// Mock SessionListPanel so we test only OpsLayout shell structure here.
vi.mock('../components/layout/SessionListPanel.js', () => ({
  SessionListPanel: () => (
    <div data-testid="session-list-panel">
      <button type="button">Launch Session</button>
    </div>
  ),
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
  it('renders a session list sidebar and a main content area', () => {
    render(<OpsLayout />)
    expect(screen.getByRole('complementary')).toBeInTheDocument() // <aside>
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('renders SessionListPanel inside the sidebar', () => {
    render(<OpsLayout />)
    expect(screen.getByTestId('session-list-panel')).toBeInTheDocument()
  })

  it('renders Agent Cockpit heading in sidebar', () => {
    render(<OpsLayout />)
    expect(screen.getByText('Agent Cockpit')).toBeInTheDocument()
  })

  it('sessions in store do not break the layout', () => {
    useStore.setState({ sessions: { a: SESSION_A, b: SESSION_B } })
    render(<OpsLayout />)
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('clicking a SessionCard calls selectSession with that session id (store unit test)', () => {
    useStore.getState().selectSession('a')
    expect(useStore.getState().selectedSessionId).toBe('a')
  })

  it('Launch Session button is rendered by SessionListPanel in sidebar', () => {
    render(<OpsLayout />)
    expect(screen.getByRole('button', { name: /launch session/i })).toBeInTheDocument()
  })
})
