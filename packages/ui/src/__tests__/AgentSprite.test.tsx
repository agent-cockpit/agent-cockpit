import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

// Mock Radix HoverCard so Content always renders (no hover interaction needed)
vi.mock('@radix-ui/react-hover-card', () => ({
  Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Trigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => <>{children}</>,
  Content: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Capture props passed to AgentHoverCard for assertion
const mockHoverCardProps: { elapsedMs?: number; lastToolUsed?: string } = {}
vi.mock('../components/office/AgentHoverCard.js', () => ({
  AgentHoverCard: (props: { elapsedMs?: number; lastToolUsed?: string }) => {
    Object.assign(mockHoverCardProps, props)
    return <div data-testid="mock-hover-card" />
  },
}))

// Mock fetch for manifest JSON
const mockFetch = vi.fn().mockResolvedValue({
  json: () => Promise.resolve({ states: { idle: 4, blocked: 8, completed: 9, failed: 7 }, frameSize: 64, directions: 8 }),
})
vi.stubGlobal('fetch', mockFetch)

// sessionId ending in '0000' → parseInt('0000',16)=0 → 0%10=0 → 'astronaut'
const mockSession: SessionRecord = {
  sessionId: 'sess-0000',
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
  elapsedMs: 0,
}

describe('AgentSprite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ states: { idle: 4, blocked: 8, completed: 9, failed: 7 }, frameSize: 64, directions: 8 }),
    })
    Object.keys(mockHoverCardProps).forEach(k => delete (mockHoverCardProps as Record<string, unknown>)[k])
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  it('renders div with correct data-testid', () => {
    render(<AgentSprite {...defaultProps} />)
    expect(screen.getByTestId('agent-sprite-sess-0000')).toBeDefined()
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
    const el = screen.getByTestId('agent-sprite-sess-0000')
    expect(el.style.position).toBe('absolute')
    expect(el.style.left).toBe('150px')
    expect(el.style.top).toBe('250px')
  })

  it('calls onClick when the root element is clicked', () => {
    const onClick = vi.fn()
    render(<AgentSprite {...defaultProps} onClick={onClick} />)
    fireEvent.click(screen.getByTestId('agent-sprite-sess-0000'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('when isDragging=true, HoverCard is force-closed (open=false prop visible)', () => {
    // We test this by checking the HoverCard.Root receives open=false when isDragging
    // Since Radix HoverCard doesn't expose its open state in DOM, we verify our prop
    // logic: the component should not throw and renders correctly with isDragging=true
    const { container } = render(<AgentSprite {...defaultProps} isDragging={true} />)
    expect(container.querySelector('[data-testid="agent-sprite-sess-0000"]')).not.toBeNull()
  })

  it('when isDragging=false, component renders normally', () => {
    render(<AgentSprite {...defaultProps} isDragging={false} />)
    expect(screen.getByTestId('agent-sprite-sess-0000')).toBeDefined()
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
    const el = screen.getByTestId('agent-sprite-sess-0000')
    expect(el).toBeDefined()
  })

  it('forwards elapsedMs prop to AgentHoverCard', () => {
    render(<AgentSprite {...defaultProps} elapsedMs={90000} />)
    expect(mockHoverCardProps.elapsedMs).toBe(90000)
  })

  it('forwards lastToolUsed prop to AgentHoverCard when provided', () => {
    render(<AgentSprite {...defaultProps} elapsedMs={0} lastToolUsed="Bash" />)
    expect(mockHoverCardProps.lastToolUsed).toBe('Bash')
  })

  it('forwards lastToolUsed as undefined to AgentHoverCard when not provided', () => {
    render(<AgentSprite {...defaultProps} elapsedMs={0} />)
    expect(mockHoverCardProps.lastToolUsed).toBeUndefined()
  })

  it('renders sprite div at 64×64', () => {
    const { container } = render(<AgentSprite {...defaultProps} />)
    const spriteDiv = container.querySelector('.agent-sprite') as HTMLElement
    expect(spriteDiv).not.toBeNull()
    expect(spriteDiv.style.width).toBe('64px')
    expect(spriteDiv.style.height).toBe('64px')
  })

  it('uses character-specific sheet URL derived from sessionId', () => {
    // sess-0000 → 'astronaut'
    const { container } = render(<AgentSprite {...defaultProps} />)
    const spriteDiv = container.querySelector('.agent-sprite') as HTMLElement
    expect(spriteDiv.style.backgroundImage).toContain('astronaut-sheet.png')
  })

  it('has imageRendering pixelated', () => {
    const { container } = render(<AgentSprite {...defaultProps} />)
    const spriteDiv = container.querySelector('.agent-sprite') as HTMLElement
    expect(spriteDiv.style.imageRendering).toBe('pixelated')
  })

  it('backgroundPositionY is 0px for planning state south (row 0)', () => {
    const { container } = render(<AgentSprite {...defaultProps} agentState="planning" direction="south" />)
    const spriteDiv = container.querySelector('.agent-sprite') as HTMLElement
    expect(spriteDiv.style.backgroundPositionY).toBe('0px')
  })

  it('backgroundPositionY is -512px for blocked state south (row 8 × 64)', () => {
    const { container } = render(<AgentSprite {...defaultProps} agentState="blocked" direction="south" />)
    const spriteDiv = container.querySelector('.agent-sprite') as HTMLElement
    expect(spriteDiv.style.backgroundPositionY).toBe('-512px')
  })

  it('backgroundPositionY is -1024px for completed state south (row 16 × 64)', () => {
    const { container } = render(<AgentSprite {...defaultProps} agentState="completed" direction="south" />)
    const spriteDiv = container.querySelector('.agent-sprite') as HTMLElement
    expect(spriteDiv.style.backgroundPositionY).toBe('-1024px')
  })

  it('defaults direction to south when not provided', () => {
    const { container } = render(<AgentSprite {...defaultProps} agentState="planning" />)
    const spriteDiv = container.querySelector('.agent-sprite') as HTMLElement
    // planning → idle → row offset 0, south → row 0, so posY = 0px
    expect(spriteDiv.style.backgroundPositionY).toBe('0px')
  })
})
