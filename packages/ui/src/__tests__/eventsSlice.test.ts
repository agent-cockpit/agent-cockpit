import { describe, it, expect } from 'vitest'
import { applyEventToEvents } from '../store/eventsSlice.js'
import type { AppStore } from '../store/index.js'

// Helper to build an empty events state
function emptyState(): Pick<AppStore, 'events'> {
  return { events: {} }
}

const SESSION_ID = '00000000-0000-0000-0000-000000000001'
const SESSION_ID_2 = '00000000-0000-0000-0000-000000000002'
const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-01T00:01:00.000Z'

const BASE_EVENT = {
  schemaVersion: 1 as const,
  sessionId: SESSION_ID,
  timestamp: T0,
}

describe('applyEventToEvents', () => {
  it('appends an event to events[sessionId] (new session creates array)', () => {
    const event = {
      ...BASE_EVENT,
      type: 'tool_call' as const,
      toolName: 'bash',
      input: { command: 'ls' },
      sequenceNumber: 1,
    }
    const state = applyEventToEvents(emptyState(), event)

    expect(state.events[SESSION_ID]).toBeDefined()
    expect(state.events[SESSION_ID]).toHaveLength(1)
    expect(state.events[SESSION_ID]![0]).toBe(event)
  })

  it('appends a second event to an existing array', () => {
    const event1 = {
      ...BASE_EVENT,
      type: 'tool_call' as const,
      toolName: 'bash',
      input: { command: 'ls' },
      sequenceNumber: 1,
    }
    const event2 = {
      ...BASE_EVENT,
      type: 'tool_call' as const,
      toolName: 'bash',
      input: { command: 'pwd' },
      timestamp: T1,
      sequenceNumber: 2,
    }

    let state = applyEventToEvents(emptyState(), event1)
    state = applyEventToEvents(state, event2)

    expect(state.events[SESSION_ID]).toHaveLength(2)
    expect(state.events[SESSION_ID]![1]).toBe(event2)
  })

  it('skips an event whose sequenceNumber is already present (dedup guard)', () => {
    const event = {
      ...BASE_EVENT,
      type: 'tool_call' as const,
      toolName: 'bash',
      input: { command: 'ls' },
      sequenceNumber: 1,
    }

    let state = applyEventToEvents(emptyState(), event)
    // Apply the same event again (same sequenceNumber)
    const stateBefore = state
    state = applyEventToEvents(state, event)

    // Should return same state reference (dedup: no change)
    expect(state).toBe(stateBefore)
    expect(state.events[SESSION_ID]).toHaveLength(1)
  })

  it('handles events without sequenceNumber (always appends)', () => {
    const event1 = {
      ...BASE_EVENT,
      type: 'tool_call' as const,
      toolName: 'bash',
      input: { command: 'ls' },
      // No sequenceNumber
    }
    const event2 = {
      ...BASE_EVENT,
      type: 'tool_call' as const,
      toolName: 'bash',
      input: { command: 'pwd' },
      timestamp: T1,
      // No sequenceNumber
    }

    let state = applyEventToEvents(emptyState(), event1)
    state = applyEventToEvents(state, event2)

    // Both appended since no sequenceNumber to dedup on
    expect(state.events[SESSION_ID]).toHaveLength(2)
  })

  it('does not mutate state (returns new object reference)', () => {
    const event = {
      ...BASE_EVENT,
      type: 'tool_call' as const,
      toolName: 'bash',
      input: { command: 'ls' },
      sequenceNumber: 1,
    }

    const initialState = emptyState()
    const newState = applyEventToEvents(initialState, event)

    expect(newState).not.toBe(initialState)
    expect(newState.events).not.toBe(initialState.events)
    // Original state unmodified
    expect(initialState.events[SESSION_ID]).toBeUndefined()
  })

  it('keeps events for different sessions independent', () => {
    const event1 = {
      ...BASE_EVENT,
      sessionId: SESSION_ID,
      type: 'tool_call' as const,
      toolName: 'bash',
      input: { command: 'ls' },
      sequenceNumber: 1,
    }
    const event2 = {
      ...BASE_EVENT,
      sessionId: SESSION_ID_2,
      type: 'tool_call' as const,
      toolName: 'bash',
      input: { command: 'pwd' },
      sequenceNumber: 1,
    }

    let state = applyEventToEvents(emptyState(), event1)
    state = applyEventToEvents(state, event2)

    expect(state.events[SESSION_ID]).toHaveLength(1)
    expect(state.events[SESSION_ID_2]).toHaveLength(1)
    expect(state.events[SESSION_ID]![0]).toBe(event1)
    expect(state.events[SESSION_ID_2]![0]).toBe(event2)
  })
})
