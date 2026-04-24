import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { useStore } from '../store/index.js'
import { TimelinePanel } from '../components/panels/TimelinePanel.js'
import type { NormalizedEvent } from '@agentcockpit/shared'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock scrollIntoView (jsdom does not implement it)
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

// Helper: render TimelinePanel with a given sessionId in router context
function renderPanel(sessionId: string) {
  return render(
    <MemoryRouter initialEntries={[`/session/${sessionId}/timeline`]}>
      <Routes>
        <Route path="/session/:sessionId/timeline" element={<TimelinePanel />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockFetch.mockReset()
  vi.mocked(Element.prototype.scrollIntoView).mockReset()
  useStore.setState({ events: {} })
})

// ─── TIMELINE-01: Ordered event list ──────────────────────────────────────────

describe('TIMELINE-01: Ordered event list', () => {
  it('renders all event rows from store events[sessionId] in order', () => {
    const events = [makeToolCall(1), makeFileChange(2), makeApprovalRequest(3)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)

    // Each label appears in both the filter chip and the event row (2x each)
    const list = screen.getByTestId('timeline-list')
    expect(within(list).getByText('Tool Call')).toBeInTheDocument()
    expect(within(list).getByText('File Change')).toBeInTheDocument()
    expect(within(list).getByText('Approval Requested')).toBeInTheDocument()
  })

  it('shows human-readable type labels using EVENT_TYPE_LABELS map', () => {
    const events = [makeToolCall(1)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)

    // Should show "Tool Call" not "tool_call" — check in the list area
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

    // Wait for fetch to resolve
    await vi.waitFor(() => {
      const stored = useStore.getState().events[SESSION_ID]
      expect(stored).toBeDefined()
      expect(stored).toHaveLength(2)
    })
  })
})

// ─── TIMELINE-02: Jump-to ─────────────────────────────────────────────────────

describe('TIMELINE-02: Jump-to', () => {
  it('"Next Approval" button scrolls to next approval_request event', () => {
    const events = [makeToolCall(1), makeApprovalRequest(2)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)

    const nextApprovalBtn = screen.getByRole('button', { name: /next approval/i })
    fireEvent.click(nextApprovalBtn)

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('"Next File Change" button scrolls to next file_change event', () => {
    const events = [makeToolCall(1), makeFileChange(2)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)

    const nextFileBtn = screen.getByRole('button', { name: /next file change/i })
    fireEvent.click(nextFileBtn)

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('"Next Approval" button is disabled when no approval_request events exist', () => {
    const events = [makeToolCall(1), makeFileChange(2)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)

    const nextApprovalBtn = screen.getByRole('button', { name: /next approval/i })
    expect(nextApprovalBtn).toBeDisabled()
  })

  it('"Next File Change" button is disabled when no file_change events exist', () => {
    const events = [makeToolCall(1), makeApprovalRequest(2)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)

    const nextFileBtn = screen.getByRole('button', { name: /next file change/i })
    expect(nextFileBtn).toBeDisabled()
  })
})

// ─── TIMELINE-03: Filter ──────────────────────────────────────────────────────

describe('TIMELINE-03: Filter', () => {
  it('clicking a filter chip hides rows that do not match the selected type', () => {
    const events = [makeToolCall(1), makeFileChange(2), makeApprovalRequest(3)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)

    // Click "Tool Call" filter chip
    const toolCallChip = screen.getByRole('button', { name: 'Tool Call' })
    fireEvent.click(toolCallChip)

    // In the timeline list: only "Tool Call" row visible, no "File Change" or "Approval Requested" rows
    const list = screen.getByTestId('timeline-list')
    expect(within(list).getByText('Tool Call')).toBeInTheDocument()
    expect(within(list).queryByText('File Change')).not.toBeInTheDocument()
    expect(within(list).queryByText('Approval Requested')).not.toBeInTheDocument()
  })

  it('clicking the active filter chip again clears the filter (shows all)', () => {
    const events = [makeToolCall(1), makeFileChange(2)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)

    const toolCallChip = screen.getByRole('button', { name: 'Tool Call' })
    // Click once to filter
    fireEvent.click(toolCallChip)
    // Click again to clear
    fireEvent.click(toolCallChip)

    // Both rows should now be visible in the list
    const list = screen.getByTestId('timeline-list')
    expect(within(list).getByText('Tool Call')).toBeInTheDocument()
    expect(within(list).getByText('File Change')).toBeInTheDocument()
  })

  it('"All" chip shows all events regardless of type', () => {
    const events = [makeToolCall(1), makeFileChange(2)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)

    // Apply a filter first
    const toolCallChip = screen.getByRole('button', { name: 'Tool Call' })
    fireEvent.click(toolCallChip)

    // Now click "All" to clear
    const allChip = screen.getByRole('button', { name: 'All' })
    fireEvent.click(allChip)

    const list = screen.getByTestId('timeline-list')
    expect(within(list).getByText('Tool Call')).toBeInTheDocument()
    expect(within(list).getByText('File Change')).toBeInTheDocument()
  })
})

// ─── TIMELINE-04: Inline detail ──────────────────────────────────────────────

describe('TIMELINE-04: Inline detail', () => {
  it('clicking an event row renders an inline detail section below it', () => {
    const events = [makeToolCall(1)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)

    // The chip bar also shows "Tool Call" — target the row inside the list
    const list = screen.getByTestId('timeline-list')
    const toolCallRowLabel = within(list).getByText('Tool Call')
    fireEvent.click(toolCallRowLabel)

    // Some detail content should appear
    expect(screen.getByText('bash')).toBeInTheDocument()
  })

  it('tool_call inline detail shows toolName and JSON-stringified toolInput', () => {
    const events = [makeToolCall(1)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)

    const list = screen.getByTestId('timeline-list')
    const toolCallRowLabel = within(list).getByText('Tool Call')
    fireEvent.click(toolCallRowLabel)

    expect(screen.getByText('bash')).toBeInTheDocument()
    // JSON input should appear
    expect(screen.getByText(/ls -la/)).toBeInTheDocument()
  })

  it('file_change inline detail shows filePath and changeType', () => {
    const events = [makeFileChange(1)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)

    const list = screen.getByTestId('timeline-list')
    const fileChangeRowLabel = within(list).getByText('File Change')
    fireEvent.click(fileChangeRowLabel)

    expect(screen.getByText(/index\.ts/)).toBeInTheDocument()
    expect(screen.getByText(/modified/)).toBeInTheDocument()
  })

  it('approval_request inline detail shows proposedAction, riskLevel, and whyRisky', () => {
    const events = [makeApprovalRequest(1)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)

    const list = screen.getByTestId('timeline-list')
    const approvalRowLabel = within(list).getByText('Approval Requested')
    fireEvent.click(approvalRowLabel)

    expect(screen.getByText(/rm -rf \/tmp\/build/)).toBeInTheDocument()
    expect(screen.getByText(/high/)).toBeInTheDocument()
    expect(screen.getByText(/Deletes files permanently/)).toBeInTheDocument()
  })

  it('clicking the same row again collapses the inline detail (toggle)', () => {
    const events = [makeToolCall(1)]
    useStore.setState({ events: { [SESSION_ID]: events } })

    renderPanel(SESSION_ID)

    const list = screen.getByTestId('timeline-list')
    const toolCallRowLabel = within(list).getByText('Tool Call')

    // Open
    fireEvent.click(toolCallRowLabel)
    expect(screen.getByText('bash')).toBeInTheDocument()

    // Close — re-query since the DOM may have changed after open
    const toolCallRowLabelAgain = within(list).getByText('Tool Call')
    fireEvent.click(toolCallRowLabelAgain)
    expect(screen.queryByText('bash')).not.toBeInTheDocument()
  })
})
