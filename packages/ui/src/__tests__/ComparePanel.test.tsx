import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComparePanel } from '../components/panels/ComparePanel.js'
import type { SessionSummary } from '../store/index.js'

const sessionLeft: SessionSummary = {
  sessionId: 'aaaaaaaa-0000-0000-0000-000000000001',
  provider: 'claude',
  workspacePath: '/repos/alpha',
  startedAt: '2026-01-01T00:00:00.000Z',
  endedAt: '2026-01-01T00:02:30.000Z',
  approvalCount: 5,
  filesChanged: 3,
  finalStatus: 'ended',
}

const sessionRight: SessionSummary = {
  sessionId: 'bbbbbbbb-0000-0000-0000-000000000002',
  provider: 'codex',
  workspacePath: '/repos/beta',
  startedAt: '2026-01-02T00:00:00.000Z',
  endedAt: null,
  approvalCount: 2,
  filesChanged: 7,
  finalStatus: 'active',
}

describe('ComparePanel', () => {
  it('renders two columns — one per session summary', () => {
    render(<ComparePanel left={sessionLeft} right={sessionRight} />)
    expect(screen.getByTestId('compare-panel')).toBeInTheDocument()
    // Two session ID prefixes
    expect(screen.getByText('aaaaaaaa')).toBeInTheDocument()
    expect(screen.getByText('bbbbbbbb')).toBeInTheDocument()
  })

  it('each column shows provider, filesChanged, approvalCount, finalStatus', () => {
    render(<ComparePanel left={sessionLeft} right={sessionRight} />)
    expect(screen.getByText('claude')).toBeInTheDocument()
    expect(screen.getByText('codex')).toBeInTheDocument()
    // filesChanged
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    // approvalCount
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    // finalStatus
    expect(screen.getByText('ended')).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument()
  })

  it('runtime is shown as elapsed time when both startedAt and endedAt are present', () => {
    render(<ComparePanel left={sessionLeft} right={sessionRight} />)
    // left session: 2m 30s
    expect(screen.getByText('2m 30s')).toBeInTheDocument()
  })

  it('runtime shows "in progress" when endedAt is null', () => {
    render(<ComparePanel left={sessionLeft} right={sessionRight} />)
    expect(screen.getByText('in progress')).toBeInTheDocument()
  })
})
