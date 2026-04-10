import { useState, useRef, useEffect } from 'react'
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

// Module-level scroll singleton for MapSidebar to call
let _scrollToSession: ((id: string) => void) | null = null
export function scrollToSession(id: string) { _scrollToSession?.(id) }

export function OfficePage() {
  const sessions = useActiveSessions()
  const events = useStore((s) => s.events)
  const [positions, setPositions] = useLocalStorage<Record<string, { x: number; y: number }>>(
    'cockpit.office.positions',
    {},
  )
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [popupOpen, setPopupOpen] = useState(false)
  const spriteRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  // Register scroll callback for MapSidebar
  useEffect(() => {
    _scrollToSession = (id: string) => {
      spriteRefs.current[id]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      })
    }
    return () => { _scrollToSession = null }
  }, [])

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
            <div
              key={session.sessionId}
              ref={(el) => { spriteRefs.current[session.sessionId] = el }}
              style={{ position: 'absolute', left: 0, top: 0 }}
            >
              <AgentSprite
                session={session}
                agentState={agentState}
                position={getPosition(session.sessionId, i)}
                isDragging={activeDragId === session.sessionId}
                onClick={() => handleSpriteClick(session.sessionId)}
                elapsedMs={elapsedMs}
                lastToolUsed={lastToolUsed}
              />
            </div>
          )
        })}

        {/* User character — static, not draggable */}
        <div
          style={{
            position: 'absolute',
            left: 2 * 96,  // col 2 of row 5 (below typical agent rows)
            top: 5 * 96,
            width: 64,
            height: 64,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              border: '2px solid rgba(255,255,255,0.3)',
            }}
          >
            👤
          </div>
          <span style={{ fontSize: 10, color: '#a5b4fc', fontWeight: 600 }}>YOU</span>
        </div>
      </div>
      <InstancePopupHub open={popupOpen} onClose={() => setPopupOpen(false)} />
    </DndContext>
  )
}
