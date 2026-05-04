import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ArtifactsPanel } from '../components/panels/ArtifactsPanel.js'
import { useStore } from '../store/index.js'

const SESSION_ID = '00000000-0000-0000-0000-000000000001'
const mockFetch = vi.fn()
global.fetch = mockFetch as typeof global.fetch

function renderPanel(sessionId: string = SESSION_ID) {
  render(
    <MemoryRouter initialEntries={[`/session/${sessionId}/artifacts`]}>
      <Routes>
        <Route path="/session/:sessionId/artifacts" element={<ArtifactsPanel />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useStore.setState({ events: {} })
  mockFetch.mockReset()
})

describe('ArtifactsPanel', () => {
  it('preserves PTY mode context in the session-start log after empty-store hydration', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/events')) {
        return Promise.resolve({
          json: async () => [
            {
              schemaVersion: 1,
              sessionId: SESSION_ID,
              timestamp: '2026-01-01T00:00:00.000Z',
              type: 'session_start',
              provider: 'claude',
              workspacePath: '/workspace/pty-project',
              mode: 'pty',
            },
          ],
        })
      }
      if (url.includes('/approvals')) {
        return Promise.resolve({ json: async () => [] })
      }
      return Promise.resolve({ json: async () => [] })
    })

    renderPanel()

    expect(await screen.findByText('claude (pty) @ /workspace/pty-project')).toBeInTheDocument()
  })
})
