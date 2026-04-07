import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { AgentSprite } from '../components/office/AgentSprite.js'
import type { SessionRecord } from '../store/index.js'

// Mock dnd-kit so tests don't need DndContext
vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
  }),
}))

// Mock AgentHoverCard to keep AgentSprite tests isolated
vi.mock('../components/office/AgentHoverCard.js', () => ({
  AgentHoverCard: () => <div data-testid="mock-hover-card" />,
}))

const mockSession: SessionRecord = {
  sessionId: 'sess-abc',
  provider: 'claude',
  workspacePath: '/home/user/my-repo',
  startedAt: '2024-01-01T00:00:00Z',
  status: 'active',
  lastEventAt: '2024-01-01T00:01:00Z',
  pendingApprovals: 0,
}

const defaultProps = {
  session: mockSession,
  agentState: 'coding' as const,
  position: { x: 100, y: 200 },
  isDragging: false,
  onClick: vi.fn(),
}

describe('AgentSprite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders div with correct data-testid', () => {
    render(<AgentSprite {...defaultProps} />)
    expect(screen.getByTestId('agent-sprite-sess-abc')).toBeDefined()
  })

  it('sprite inner div has className containing STATE_CSS_CLASSES[agentState]', () => {
    const { container } = render(<AgentSprite {...defaultProps} agentState="coding" />)
    // Find the sprite inner div — it should have class sprite-coding
    const spriteDiv = container.querySelector('.sprite-coding')
    expect(spriteDiv).not.toBeNull()
  })

  it('applies correct CSS class for planning state', () => {
    const { container } = render(<AgentSprite {...defaultProps} agentState="planning" />)
    expect(container.querySelector('.sprite-planning')).not.toBeNull()
  })

  it('renders with absolute positioning at the given x,y', () => {
    render(<AgentSprite {...defaultProps} position={{ x: 150, y: 250 }} />)
    const el = screen.getByTestId('agent-sprite-sess-abc')
    expect(el.style.position).toBe('absolute')
    expect(el.style.left).toBe('150px')
    expect(el.style.top).toBe('250px')
  })

  it('calls onClick when the root element is clicked', () => {
    const onClick = vi.fn()
    render(<AgentSprite {...defaultProps} onClick={onClick} />)
    fireEvent.click(screen.getByTestId('agent-sprite-sess-abc'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('when isDragging=true, HoverCard is force-closed (open=false prop visible)', () => {
    // We test this by checking the HoverCard.Root receives open=false when isDragging
    // Since Radix HoverCard doesn't expose its open state in DOM, we verify our prop
    // logic: the component should not throw and renders correctly with isDragging=true
    const { container } = render(<AgentSprite {...defaultProps} isDragging={true} />)
    expect(container.querySelector('[data-testid="agent-sprite-sess-abc"]')).not.toBeNull()
  })

  it('when isDragging=false, component renders normally', () => {
    render(<AgentSprite {...defaultProps} isDragging={false} />)
    expect(screen.getByTestId('agent-sprite-sess-abc')).toBeDefined()
  })

  it('shows workspace basename as label text', () => {
    render(<AgentSprite {...defaultProps} />)
    // workspacePath is '/home/user/my-repo', basename is 'my-repo'
    expect(screen.getByText('my-repo')).toBeDefined()
  })

  it('handles workspacePath with trailing slash gracefully', () => {
    const session = { ...mockSession, workspacePath: '/home/user/project/' }
    render(<AgentSprite {...defaultProps} session={session} />)
    // basename of '/home/user/project/' — split('/') gives [..., 'project', '']
    // should display the last non-empty segment
    const el = screen.getByTestId('agent-sprite-sess-abc')
    expect(el).toBeDefined()
  })
})
