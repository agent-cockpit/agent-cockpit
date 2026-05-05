import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { useStore } from '../store/index.js'
import { TimelinePanel } from '../components/panels/TimelinePanel.js'
import type { NormalizedEvent } from '@agentcockpit/shared'

const mockFetch = vi.fn()
global.fetch = mockFetch
Element.prototype.scrollIntoView = vi.fn()

const SESSION_ID = '00000000-0000-0000-0000-000000000001'
const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-01T00:01:00.000Z'
const T2 = '2026-01-01T00:02:00.000Z'

function makeToolCall(seq: number, timestamp = T0): NormalizedEvent & { sequenceNumber: number } {
  return {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    timestamp,
    sequenceNumber: seq,
    type: 'tool_call',
    toolName: 'bash',
    input: { command: 'ls -la' },
  }
}

function makeFileChange(seq: number, timestamp = T1): NormalizedEvent & { sequenceNumber: number } {
  return {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    timestamp,
    sequenceNumber: seq,
    type: 'file_change',
    filePath: '/home/user/project/src/index.ts',
    changeType: 'modified',
    diff: '--- a\n+++ b\n@@ -1 +1 @@',
  }
}

function makeApprovalRequest(seq: number, timestamp = T2): NormalizedEvent & { sequenceNumber: number } {
  return {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    timestamp,
    sequenceNumber: seq,
    type: 'approval_request',
    approvalId: '00000000-0000-0000-0000-000000000099',
    actionType: 'shell_command',
    riskLevel: 'high',
    proposedAction: 'rm -rf /tmp/build',
    whyRisky: 'Deletes files permanently',
  }
}

function renderPanel(sessionId: string) {
  return render(
    <MemoryRouter initialEntries={[`/session/${sessionId}/timeline`]}>
      <Routes>
        <Route path="/session/:sessionId/timeline" element={<TimelinePanel />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** Switch to Raw Events mode by clicking the toggle button */
function switchToRawMode() {
  const rawBtn = screen.getByRole('button', { name: /raw events/i })
  fireEvent.click(rawBtn)
}

beforeEach(() => {
  mockFetch.mockReset()
  vi.mocked(Element.prototype.scrollIntoView).mockReset()
  useStore.setState({ events: {} })
})

// ─── TIMELINE-01: Event display ───────────────────────────────────────────────

describe('TIMELINE-01: Event display', () => {
  it('renders event rows in raw mode for each event in the store', () => {
    const events = [makeToolCall(1), makeFileChange(2), makeApprovalRequest(3)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)
    switchToRawMode()

    const list = screen.getByTestId('timeline-list')
    expect(within(list).getByText('Tool Call')).toBeInTheDocument()
    expect(within(list).getByText('File Change')).toBeInTheDocument()
    expect(within(list).getByText('Approval Requested')).toBeInTheDocument()
  })

  it('shows human-readable type labels (not raw type strings) in raw mode', () => {
    const events = [makeToolCall(1)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)
    switchToRawMode()

    const list = screen.getByTestId('timeline-list')
    expect(within(list).getByText('Tool Call')).toBeInTheDocument()
    expect(screen.queryByText('tool_call')).not.toBeInTheDocument()
  })

  it('calls fetch on mount when store events are empty', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => [makeToolCall(1)],
    })

    renderPanel(SESSION_ID)

    expect(mockFetch).toHaveBeenCalledOnce()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/sessions/${SESSION_ID}/events`),
    )
  })

  it('does NOT fetch when store already has events for the session', () => {
    const events = [makeToolCall(1)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('calls bulkApplyEvents with fetched events after successful fetch', async () => {
    const fetchedEvents = [makeToolCall(1), makeFileChange(2)]
    mockFetch.mockResolvedValueOnce({
      json: async () => fetchedEvents,
    })

    renderPanel(SESSION_ID)

    await vi.waitFor(() => {
      const stored = useStore.getState().events[SESSION_ID]
      expect(stored).toBeDefined()
      expect(stored).toHaveLength(2)
    })
  })
})

// ─── TIMELINE-02: Turn grouping ───────────────────────────────────────────────

describe('TIMELINE-02: Turn grouping', () => {
  it('shows a Turns toggle button', () => {
    const events = [makeToolCall(1)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)

    expect(screen.getByRole('button', { name: /turns/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /raw events/i })).toBeInTheDocument()
  })

  it('turns mode shows summary chips with tool/file/approval counts', () => {
    const events = [makeToolCall(1), makeFileChange(2), makeApprovalRequest(3)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)

    // Default is turns mode — summary chips should be visible
    const list = screen.getByTestId('timeline-list')
    expect(within(list).getByText(/1 tools/i)).toBeInTheDocument()
    expect(within(list).getByText(/1 files/i)).toBeInTheDocument()
    expect(within(list).getByText(/1 approval/i)).toBeInTheDocument()
  })

  it('switching to raw mode shows individual event rows', () => {
    const events = [makeToolCall(1), makeFileChange(2)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)
    switchToRawMode()

    const list = screen.getByTestId('timeline-list')
    expect(within(list).getByText('Tool Call')).toBeInTheDocument()
    expect(within(list).getByText('File Change')).toBeInTheDocument()
  })

  it('displays event + turn count in status readout', () => {
    const events = [makeToolCall(1), makeFileChange(2)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)

    expect(screen.getByText(/2 events/i)).toBeInTheDocument()
  })
})

// ─── TIMELINE-03: Raw mode event expansion ────────────────────────────────────

describe('TIMELINE-03: Raw mode event expansion', () => {
  it('clicking an event row in raw mode expands its detail (shows JSON with command)', () => {
    const events = [makeToolCall(1)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)
    switchToRawMode()

    const list = screen.getByTestId('timeline-list')
    const toolCallRow = within(list).getByText('Tool Call')
    fireEvent.click(toolCallRow)

    // JSON expansion should contain the command
    expect(screen.getByText(/ls -la/)).toBeInTheDocument()
  })

  it('clicking the same row again collapses the inline detail (toggle)', () => {
    const events = [makeToolCall(1)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)
    switchToRawMode()

    const list = screen.getByTestId('timeline-list')
    const toolCallRow = within(list).getByText('Tool Call')

    // Expand — JSON with command becomes visible
    fireEvent.click(toolCallRow)
    expect(screen.getByText(/ls -la/)).toBeInTheDocument()

    // Collapse — JSON disappears
    const toolCallRowAgain = within(list).getByText('Tool Call')
    fireEvent.click(toolCallRowAgain)
    expect(screen.queryByText(/ls -la/)).not.toBeInTheDocument()
  })
})

// ─── TIMELINE-04: Turns expansion ─────────────────────────────────────────────

describe('TIMELINE-04: Turn expansion', () => {
  it('clicking a turn card expands to show individual events', () => {
    const events = [makeToolCall(1), makeFileChange(2)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)

    // Should see a turn card (default turns mode)
    const list = screen.getByTestId('timeline-list')
    // Click the turn card header (it contains the turn number and summary chips)
    const turnCard = within(list).getByText(/1 tools/i).closest('[class*="cursor-pointer"]')
    expect(turnCard).not.toBeNull()
    fireEvent.click(turnCard!)

    // Individual event rows should now be visible
    expect(within(list).getByText('Tool Call')).toBeInTheDocument()
    expect(within(list).getByText('File Change')).toBeInTheDocument()
  })
})
