import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// Mock Radix Dialog — portal renders children synchronously in tests
let mockDialogOnOpenChange: ((open: boolean) => void) | null = null
vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode }) => {
    mockDialogOnOpenChange = onOpenChange
    return open ? <div data-testid="dialog-root">{children}</div> : null
  },
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Overlay: () => <div data-testid="dialog-overlay" />,
  Content: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-content">{children}</div>,
  Close: ({ children }: { children: React.ReactNode }) =>
    <button onClick={() => mockDialogOnOpenChange?.(false)} aria-label="Close">{children}</button>,
  Title: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

// Mock Radix Tabs — render synchronously
vi.mock('@radix-ui/react-tabs', () => ({
  Root: ({
    children,
    defaultValue,
    value,
  }: {
    children: React.ReactNode
    defaultValue?: string
    value?: string
  }) => (
    <div data-testid="tabs-root" data-default-value={defaultValue} data-value={value}>
      {children}
    </div>
  ),
  List: ({ children }: { children: React.ReactNode }) => <div role="tablist">{children}</div>,
  Trigger: ({ value, children }: { value: string; children: React.ReactNode }) =>
    <button role="tab" data-value={value}>{children}</button>,
  Content: ({ value, children }: { value: string; children: React.ReactNode }) =>
    <div data-tab-content={value}>{children}</div>,
}))

// Mock all panels to lightweight stubs
vi.mock('../../../components/panels/ApprovalInbox.js', () => ({
  ApprovalInbox: () => <div data-testid="approval-inbox">ApprovalInbox</div>,
}))
vi.mock('../../../components/panels/TimelinePanel.js', () => ({
  TimelinePanel: () => <div data-testid="timeline-panel">TimelinePanel</div>,
}))
vi.mock('../../../components/panels/DiffPanel.js', () => ({
  DiffPanel: () => <div data-testid="diff-panel">DiffPanel</div>,
}))
vi.mock('../../../components/panels/MemoryPanel.js', () => ({
  MemoryPanel: () => <div data-testid="memory-panel">MemoryPanel</div>,
}))
vi.mock('../../../components/panels/ArtifactsPanel.js', () => ({
  ArtifactsPanel: () => <div data-testid="artifacts-panel">ArtifactsPanel</div>,
}))
vi.mock('../../../components/panels/ChatPanel.js', () => ({
  ChatPanel: () => <div data-testid="chat-panel">ChatPanel</div>,
}))

// Mock store
type PopupTabId = 'approvals' | 'chat' | 'timeline' | 'diff' | 'memory' | 'artifacts'
let mockStore = {
  selectedSessionId: 'session-123',
  sessions: {
    'session-123': {
      sessionId: 'session-123',
      workspacePath: '/home/user/my-project',
      provider: 'claude',
      status: 'active',
      startedAt: 0,
    },
  },
  popupPreferredTab: null as PopupTabId | null,
  setPopupPreferredTab: vi.fn((_tab: PopupTabId | null) => {}),
}
vi.mock('../../../store/index.js', () => ({
  useStore: (selector: (s: typeof mockStore) => unknown) => selector(mockStore),
}))

import { InstancePopupHub } from '../InstancePopupHub.js'

describe('InstancePopupHub', () => {
  beforeEach(() => {
    mockStore.popupPreferredTab = null
    mockStore.setPopupPreferredTab.mockClear()
  })

  it('renders nothing when open=false', () => {
    const { container } = render(<InstancePopupHub open={false} onClose={vi.fn()} />)
    expect(container.querySelector('[data-testid="dialog-root"]')).toBeNull()
  })

  it('renders Dialog when open=true', () => {
    render(<InstancePopupHub open={true} onClose={vi.fn()} />)
    expect(screen.getByTestId('dialog-content')).toBeInTheDocument()
  })

  it('renders all 6 tab triggers including Chat', () => {
    render(<InstancePopupHub open={true} onClose={vi.fn()} />)
    expect(screen.getByText('Approvals')).toBeInTheDocument()
    expect(screen.getByText('Chat')).toBeInTheDocument()
    expect(screen.getByText('Timeline')).toBeInTheDocument()
    expect(screen.getByText('Diff')).toBeInTheDocument()
    expect(screen.getByText('Memory')).toBeInTheDocument()
    expect(screen.getByText('Artifacts')).toBeInTheDocument()
  })

  it('shows session name from store in header', () => {
    render(<InstancePopupHub open={true} onClose={vi.fn()} />)
    expect(screen.getByText('my-project')).toBeInTheDocument()
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(<InstancePopupHub open={true} onClose={onClose} />)
    const closeButton = screen.getByLabelText('Close')
    expect(closeButton).toBeInTheDocument()
    fireEvent.click(closeButton)
    // The Dialog.Root's onOpenChange should call onClose with false
    expect(onClose).toHaveBeenCalled()
  })

  it('renders ApprovalInbox inside approvals tab content', () => {
    render(<InstancePopupHub open={true} onClose={vi.fn()} />)
    expect(screen.getByTestId('approval-inbox')).toBeInTheDocument()
  })

  it('renders ChatPanel inside chat tab content', () => {
    render(<InstancePopupHub open={true} onClose={vi.fn()} />)
    expect(screen.getByTestId('chat-panel')).toBeInTheDocument()
  })

  it('initializes popup tabs to chat when popupPreferredTab is chat', () => {
    mockStore.popupPreferredTab = 'chat'
    render(<InstancePopupHub open={true} onClose={vi.fn()} />)

    const tabsRoot = screen.getByTestId('tabs-root')
    const activeTab =
      tabsRoot.getAttribute('data-value') ??
      tabsRoot.getAttribute('data-default-value')
    expect(activeTab).toBe('chat')
  })

  it('consumes popupPreferredTab after applying chat preference', () => {
    mockStore.popupPreferredTab = 'chat'
    render(<InstancePopupHub open={true} onClose={vi.fn()} />)

    expect(mockStore.setPopupPreferredTab).toHaveBeenCalledWith(null)
  })
})
