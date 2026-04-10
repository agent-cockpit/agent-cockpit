import { useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { useStore } from '../store/index.js'
import { useActiveSessions } from '../store/selectors.js'
import { useLocalStorage } from '../hooks/useLocalStorage.js'
import { deriveAgentState } from '../components/office/spriteStates.js'
import { AgentSprite } from '../components/office/AgentSprite.js'
import { InstancePopupHub } from '../components/office/InstancePopupHub.js'

const CELL = 96
const COLS = 5

export function OfficePage() {
  const sessions = useActiveSessions()
  const events = useStore((s) => s.events)
  const [positions, setPositions] = useLocalStorage<Record<string, { x: number; y: number }>>(
    'cockpit.office.positions',
    {},
  )
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [popupOpen, setPopupOpen] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  function getPosition(sessionId: string, index: number) {
    return (
      positions[sessionId] ?? {
        x: (index % COLS) * CELL,
        y: Math.floor(index / COLS) * CELL,
      }
    )
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, delta } = event
    const id = active.id as string
    const base = positions[id] ?? { x: 0, y: 0 }
    setPositions((prev) => ({ ...prev, [id]: { x: base.x + delta.x, y: base.y + delta.y } }))
    setActiveDragId(null)
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(event.active.id as string)
  }

  function handleSpriteClick(sessionId: string) {
    useStore.getState().selectSession(sessionId)
    useStore.getState().setHistoryMode?.(false)
    setPopupOpen(true)
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div
        className="relative w-full h-full overflow-hidden"
        data-testid="office-canvas"
        style={{
          backgroundImage: "url('/sprites/floor-tileset.png')",
          backgroundRepeat: 'repeat',
          backgroundSize: '64px 64px',
        }}
      >
        {sessions.map((session, i) => {
          const sessionEvents = events[session.sessionId] ?? []
          const lastEvent = sessionEvents.at(-1)
          const agentState = deriveAgentState(session, lastEvent)
          const elapsedMs = Date.now() - Date.parse(session.startedAt)
          const lastToolUsed =
            lastEvent?.type === 'tool_call' ? (lastEvent.toolName as string | undefined) : undefined
          return (
            <AgentSprite
              key={session.sessionId}
              session={session}
              agentState={agentState}
              position={getPosition(session.sessionId, i)}
              isDragging={activeDragId === session.sessionId}
              onClick={() => handleSpriteClick(session.sessionId)}
              elapsedMs={elapsedMs}
              lastToolUsed={lastToolUsed}
            />
          )
        })}
      </div>
      <InstancePopupHub open={popupOpen} onClose={() => setPopupOpen(false)} />
    </DndContext>
  )
}
