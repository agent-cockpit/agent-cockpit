import React from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import * as HoverCard from '@radix-ui/react-hover-card'
import type { SessionRecord } from '../../store/index.js'
import { STATE_CSS_CLASSES } from './spriteStates.js'
import type { AgentAnimState } from './spriteStates.js'
import { AgentHoverCard } from './AgentHoverCard.js'

interface AgentSpriteProps {
  session: SessionRecord
  agentState: AgentAnimState
  position: { x: number; y: number }
  isDragging: boolean
  onClick: () => void
  elapsedMs: number
  lastToolUsed?: string
}

export function AgentSprite({
  session,
  agentState,
  position,
  isDragging,
  onClick,
  elapsedMs,
  lastToolUsed,
}: AgentSpriteProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: session.sessionId,
  })

  // Get the basename of workspacePath (last non-empty segment)
  const basename =
    session.workspacePath
      .split('/')
      .filter(Boolean)
      .pop() ?? session.sessionId

  return (
    <HoverCard.Root
      openDelay={300}
      closeDelay={100}
      open={isDragging ? false : undefined}
    >
      <HoverCard.Trigger asChild>
        <div
          ref={setNodeRef}
          data-testid={`agent-sprite-${session.sessionId}`}
          style={{
            position: 'absolute',
            left: position.x,
            top: position.y,
            transform: CSS.Transform.toString(transform) ?? undefined,
            cursor: transform ? 'grabbing' : 'pointer',
            touchAction: 'none',
          }}
          onClick={onClick}
          {...listeners}
          {...attributes}
        >
          <div
            className={`agent-sprite ${STATE_CSS_CLASSES[agentState]}`}
            style={{
              backgroundImage: "url('/sprites/agent-sheet.png')",
              imageRendering: 'pixelated',
              width: 32,
              height: 32,
            }}
          />
          <span>{basename}</span>
        </div>
      </HoverCard.Trigger>
      <HoverCard.Content side="top" sideOffset={8}>
        <AgentHoverCard session={session} elapsedMs={elapsedMs} lastToolUsed={lastToolUsed} />
      </HoverCard.Content>
    </HoverCard.Root>
  )
}
