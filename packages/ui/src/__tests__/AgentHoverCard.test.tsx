import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { AgentHoverCard } from '../components/office/AgentHoverCard.js'
import type { SessionRecord } from '../store/index.js'

const claudeSession: SessionRecord = {
  sessionId: 'sess-xyz',
  provider: 'claude',
  workspacePath: '/home/user/my-project',
  startedAt: '2024-01-01T00:00:00Z',
  status: 'active',
  lastEventAt: '2024-01-01T00:02:00Z',
  pendingApprovals: 0,
  character: 'astronaut',
}

const codexSession: SessionRecord = {
  ...claudeSession,
  provider: 'codex',
}

describe('AgentHoverCard', () => {
  it('renders provider badge "Claude" when provider is claude', () => {
    render(<AgentHoverCard session={claudeSession} elapsedMs={0} />)
    expect(screen.getByTestId('provider-badge').textContent).toBe('Claude')
  })

  it('renders provider badge "Codex" when provider is codex', () => {
    render(<AgentHoverCard session={codexSession} elapsedMs={0} />)
    expect(screen.getByTestId('provider-badge').textContent).toBe('Codex')
  })

  it('renders task title as basename of workspacePath', () => {
    render(<AgentHoverCard session={claudeSession} elapsedMs={0} />)
    // workspacePath = '/home/user/my-project', basename = 'my-project'
    expect(screen.getByTestId('task-title').textContent).toBe('my-project')
  })

  it('renders status from session.status', () => {
    render(<AgentHoverCard session={claudeSession} elapsedMs={0} />)
    expect(screen.getByTestId('agent-status').textContent).toBe('active')
  })

  it('renders ended status correctly', () => {
    render(<AgentHoverCard session={{ ...claudeSession, status: 'ended' }} elapsedMs={0} />)
    expect(screen.getByTestId('agent-status').textContent).toBe('ended')
  })

  it('renders repo name as last path segment of workspacePath', () => {
    render(<AgentHoverCard session={claudeSession} elapsedMs={0} />)
    expect(screen.getByTestId('repo-name').textContent).toBe('my-project')
  })

  it('renders pending approvals count', () => {
    render(<AgentHoverCard session={{ ...claudeSession, pendingApprovals: 3 }} elapsedMs={0} />)
    expect(screen.getByTestId('pending-approvals').textContent).toBe('3')
  })

  it('renders pending approvals as 0 when none', () => {
    render(<AgentHoverCard session={claudeSession} elapsedMs={0} />)
    expect(screen.getByTestId('pending-approvals').textContent).toBe('0')
  })

  it('renders parent and child session relation badges', () => {
    render(
      <AgentHoverCard
        session={{
          ...claudeSession,
          parentSessionId: '00000000-0000-0000-0000-000000000001',
          childSessionIds: ['00000000-0000-0000-0000-000000000002'],
        }}
        elapsedMs={0}
      />,
    )
    expect(screen.getByTestId('agent-parent').textContent).toBe('parent 00000000')
    expect(screen.getByTestId('agent-children').textContent).toBe('1 child')
  })

  it('renders project id when available', () => {
    render(<AgentHoverCard session={{ ...claudeSession, projectId: 'my-project-12345678' }} elapsedMs={0} />)
    expect(screen.getByTestId('agent-project').textContent).toBe('my-project-12345678')
  })

  it('renders last tool used when provided', () => {
    render(<AgentHoverCard session={claudeSession} lastToolUsed="read_file" elapsedMs={0} />)
    expect(screen.getByTestId('last-tool').textContent).toBe('read_file')
  })

  it('renders "—" when lastToolUsed is undefined', () => {
    render(<AgentHoverCard session={claudeSession} elapsedMs={0} />)
    expect(screen.getByTestId('last-tool').textContent).toBe('—')
  })

  it('formats elapsed time: 125000ms → "2m 5s"', () => {
    render(<AgentHoverCard session={claudeSession} elapsedMs={125000} />)
    expect(screen.getByTestId('elapsed-time').textContent).toBe('2m 5s')
  })

  it('formats elapsed time: <60s shows "0m Xs"', () => {
    render(<AgentHoverCard session={claudeSession} elapsedMs={45000} />)
    expect(screen.getByTestId('elapsed-time').textContent).toBe('0m 45s')
  })

  it('formats elapsed time: 0ms → "0m 0s"', () => {
    render(<AgentHoverCard session={claudeSession} elapsedMs={0} />)
    expect(screen.getByTestId('elapsed-time').textContent).toBe('0m 0s')
  })

  it('formats elapsed time: 3661000ms → "61m 1s"', () => {
    render(<AgentHoverCard session={claudeSession} elapsedMs={3661000} />)
    expect(screen.getByTestId('elapsed-time').textContent).toBe('61m 1s')
  })

  it('renders without crashing when all optional props are undefined', () => {
    render(<AgentHoverCard session={claudeSession} elapsedMs={0} />)
    expect(screen.getByTestId('provider-badge')).toBeDefined()
    expect(screen.getByTestId('task-title')).toBeDefined()
    expect(screen.getByTestId('agent-status')).toBeDefined()
    expect(screen.getByTestId('repo-name')).toBeDefined()
    expect(screen.getByTestId('pending-approvals')).toBeDefined()
    expect(screen.getByTestId('last-tool')).toBeDefined()
    expect(screen.getByTestId('elapsed-time')).toBeDefined()
  })
})
