import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ArtifactsPanel } from '../components/panels/ArtifactsPanel.js'
import { useStore } from '../store/index.js'
import type { NormalizedEvent } from '@agentcockpit/shared'

const SESSION_ID = '00000000-0000-0000-0000-000000000555'

const mockFetch = vi.fn()
global.fetch = mockFetch

function makeFileChange(filePath: string, timestamp: string): NormalizedEvent {
  return {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    timestamp,
    type: 'file_change',
    filePath,
    changeType: 'modified',
    diff: `--- a/${filePath}\n+++ b/${filePath}\n@@`,
  }
}

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={[`/session/${SESSION_ID}/artifacts`]}>
      <Routes>
        <Route path="/session/:sessionId/artifacts" element={<ArtifactsPanel />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({ json: async () => [] })
  useStore.setState({ events: {}, replayCursorBySession: {} })
})

describe('ArtifactsPanel', () => {
  it('truncates artifacts and logs to the shared replay cursor', () => {
    useStore.setState({
      events: {
        [SESSION_ID]: [
          makeFileChange('/workspace/first.ts', '2026-01-01T00:00:00.000Z'),
          makeFileChange('/workspace/second.ts', '2026-01-01T00:00:01.000Z'),
        ],
      },
      replayCursorBySession: { [SESSION_ID]: 0 },
    })

    renderPanel()

    expect(screen.getByTestId('artifacts-replay-banner')).toHaveTextContent('Replay view')
    expect(screen.getByText('/workspace/first.ts')).toBeInTheDocument()
    expect(screen.queryByText('/workspace/second.ts')).not.toBeInTheDocument()
  })
})
