import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ComparePanel } from '../components/panels/ComparePanel.js'
import type { SessionSummary } from '../store/index.js'

const sessionLeft: SessionSummary = {
  sessionId: 'aaaaaaaa-0000-0000-0000-000000000001',
  provider: 'claude',
  workspacePath: '/repos/alpha',
  title: 'Refactor approvals',
  tags: ['review'],
  projectId: 'alpha-12345678',
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
  title: 'Alternative approvals',
  projectId: 'beta-12345678',
  startedAt: '2026-01-02T00:00:00.000Z',
  endedAt: null,
  approvalCount: 2,
  filesChanged: 7,
  finalStatus: 'active',
}

describe('ComparePanel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        const isLeft = url.includes(sessionLeft.sessionId)
        if (url.endsWith('/events')) {
          return Promise.resolve({
            json: () => Promise.resolve(isLeft ? [
              { type: 'file_change', filePath: 'packages/ui/src/App.tsx', changeType: 'modified' },
              { type: 'file_change', filePath: 'packages/ui/src/Approvals.tsx', changeType: 'modified' },
              { type: 'tool_call', toolName: 'pnpm test', input: 'pnpm test', output: '12 tests passed', exitCode: 0 },
              { type: 'session_end', reason: 'Implemented approval refactor and verified tests.' },
            ] : [
              { type: 'file_change', filePath: 'packages/ui/src/App.tsx', changeType: 'modified' },
              { type: 'file_change', filePath: 'packages/daemon/src/server.ts', changeType: 'modified' },
              { type: 'tool_call', toolName: 'vitest', input: 'vitest run', output: '1 test failed', exitCode: 1 },
            ]),
          })
        }
        return Promise.resolve({
          json: () => Promise.resolve({
            tokens: { input: 0, output: 0, cached: 0, total: 0, model: null },
            toolCalls: { total: 0, byTool: [] },
            fileChanges: isLeft
              ? { total: 3, created: 1, modified: 2, deleted: 0 }
              : { total: 7, created: 2, modified: 4, deleted: 1 },
            approvals: isLeft
              ? { total: 5, approved: 5, denied: 0 }
              : { total: 2, approved: 1, denied: 1 },
            subagentSpawns: 0,
            duration: isLeft ? 150_000 : null,
          }),
        })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders two columns — one per session summary', async () => {
    render(<ComparePanel left={sessionLeft} right={sessionRight} />)
    expect(screen.getByTestId('compare-panel')).toBeInTheDocument()
    // Two session ID prefixes
    expect(screen.getByText('aaaaaaaa')).toBeInTheDocument()
    expect(screen.getByText('bbbbbbbb')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('File Changes')).toBeInTheDocument()
    })
    expect(screen.getAllByText('Refactor approvals').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Alternative approvals').length).toBeGreaterThan(0)
    expect(screen.getByText('alpha-12345678')).toBeInTheDocument()
    expect(screen.getByText('beta-12345678')).toBeInTheDocument()
  })

  it('each column shows provider, filesChanged, approvalCount, finalStatus', async () => {
    render(<ComparePanel left={sessionLeft} right={sessionRight} />)
    expect(screen.getByText('claude')).toBeInTheDocument()
    expect(screen.getByText('codex')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('File Changes')).toBeInTheDocument()
    })
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('5').length).toBeGreaterThan(0)
    // finalStatus
    expect(screen.getByText('ended')).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument()
  })

  it('runtime is shown as elapsed time when both startedAt and endedAt are present', async () => {
    render(<ComparePanel left={sessionLeft} right={sessionRight} />)
    expect(await screen.findByText('2m 30s')).toBeInTheDocument()
  })

  it('runtime shows "live" when duration is null', async () => {
    render(<ComparePanel left={sessionLeft} right={sessionRight} />)
    expect(await screen.findByText('live')).toBeInTheDocument()
  })

  it('shows changed-file overlap and unique files from session events', async () => {
    render(<ComparePanel left={sessionLeft} right={sessionRight} />)
    expect(await screen.findByText('Diff Overlap')).toBeInTheDocument()
    expect(screen.getByText('packages/ui/src/App.tsx')).toBeInTheDocument()
    expect(screen.getByText('packages/ui/src/Approvals.tsx')).toBeInTheDocument()
    expect(screen.getByText('packages/daemon/src/server.ts')).toBeInTheDocument()
  })

  it('shows detected test results and summary fallbacks', async () => {
    render(<ComparePanel left={sessionLeft} right={sessionRight} />)
    expect(await screen.findByText('Tests passed')).toBeInTheDocument()
    expect(screen.getByText('Tests failed')).toBeInTheDocument()
    expect(screen.getByText('Implemented approval refactor and verified tests.')).toBeInTheDocument()
    expect(screen.getByText('1 test failed')).toBeInTheDocument()
  })

  it('lets the user mark a preferred run locally', async () => {
    render(<ComparePanel left={sessionLeft} right={sessionRight} />)
    expect(await screen.findByText('No pick')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Prefer right' }))
    expect(screen.getByText('Preferred right')).toBeInTheDocument()
  })
})
