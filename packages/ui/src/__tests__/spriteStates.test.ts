import { describe, it, expect } from 'vitest'
import { deriveAgentState, STATE_CSS_CLASSES, AgentAnimState } from '../components/office/spriteStates.js'
import type { SessionRecord } from '../store/index.js'
import type { NormalizedEvent } from '@cockpit/shared'

const activeSession: SessionRecord = {
  sessionId: 'sess-1',
  provider: 'claude',
  workspacePath: '/tmp',
  startedAt: '2024-01-01T00:00:00Z',
  status: 'active',
  lastEventAt: '2024-01-01T00:01:00Z',
  pendingApprovals: 0,
}

const toolCallEvent = (toolName: string): NormalizedEvent =>
  ({
    type: 'tool_call',
    sessionId: 'sess-1',
    timestamp: '2024-01-01T00:01:00Z',
    toolName,
    input: {},
  } as unknown as NormalizedEvent)

describe('deriveAgentState', () => {
  it('returns completed when session.status is ended', () => {
    const ended = { ...activeSession, status: 'ended' as const }
    expect(deriveAgentState(ended, undefined)).toBe('completed')
  })

  it('returns completed even when there is a lastEvent if status is ended', () => {
    const ended = { ...activeSession, status: 'ended' as const }
    const event = { type: 'tool_call', sessionId: 'sess-1', timestamp: '...', toolName: 'bash', input: {} } as unknown as NormalizedEvent
    expect(deriveAgentState(ended, event)).toBe('completed')
  })

  it('returns blocked when pendingApprovals > 0', () => {
    const blocked = { ...activeSession, pendingApprovals: 1 }
    expect(deriveAgentState(blocked, undefined)).toBe('blocked')
  })

  it('returns blocked when pendingApprovals > 0 regardless of lastEvent type', () => {
    const blocked = { ...activeSession, pendingApprovals: 2 }
    const event = { type: 'session_start', sessionId: 'sess-1', timestamp: '...' } as unknown as NormalizedEvent
    expect(deriveAgentState(blocked, event)).toBe('blocked')
  })

  it('returns waiting when status is active, pendingApprovals is 0, and no lastEvent', () => {
    expect(deriveAgentState(activeSession, undefined)).toBe('waiting')
  })

  it('returns planning for session_start event', () => {
    const event = { type: 'session_start', sessionId: 'sess-1', timestamp: '...' } as unknown as NormalizedEvent
    expect(deriveAgentState(activeSession, event)).toBe('planning')
  })

  it('returns reading for tool_call with read_file toolName', () => {
    expect(deriveAgentState(activeSession, toolCallEvent('read_file'))).toBe('reading')
  })

  it('returns coding for tool_call with write_to_file toolName', () => {
    expect(deriveAgentState(activeSession, toolCallEvent('write_to_file'))).toBe('coding')
  })

  it('returns testing for tool_call with bash toolName', () => {
    expect(deriveAgentState(activeSession, toolCallEvent('bash'))).toBe('testing')
  })

  it('returns coding (default) for tool_call with unknown toolName', () => {
    expect(deriveAgentState(activeSession, toolCallEvent('unknown'))).toBe('coding')
  })

  it('returns coding for file_change event', () => {
    const event = { type: 'file_change', sessionId: 'sess-1', timestamp: '...' } as unknown as NormalizedEvent
    expect(deriveAgentState(activeSession, event)).toBe('coding')
  })

  it('returns reading for memory_read event', () => {
    const event = { type: 'memory_read', sessionId: 'sess-1', timestamp: '...' } as unknown as NormalizedEvent
    expect(deriveAgentState(activeSession, event)).toBe('reading')
  })

  it('returns planning for memory_write event', () => {
    const event = { type: 'memory_write', sessionId: 'sess-1', timestamp: '...' } as unknown as NormalizedEvent
    expect(deriveAgentState(activeSession, event)).toBe('planning')
  })

  it('returns blocked for approval_request event', () => {
    const event = { type: 'approval_request', sessionId: 'sess-1', timestamp: '...' } as unknown as NormalizedEvent
    expect(deriveAgentState(activeSession, event)).toBe('blocked')
  })

  it('returns failed for provider_parse_error event', () => {
    const event = { type: 'provider_parse_error', sessionId: 'sess-1', timestamp: '...' } as unknown as NormalizedEvent
    expect(deriveAgentState(activeSession, event)).toBe('failed')
  })
})

describe('STATE_CSS_CLASSES', () => {
  it('maps planning to sprite-planning', () => {
    expect(STATE_CSS_CLASSES['planning']).toBe('sprite-planning')
  })

  it('has an entry for each of the 8 states', () => {
    const expectedStates: AgentAnimState[] = [
      'planning', 'coding', 'reading', 'testing', 'waiting', 'blocked', 'completed', 'failed',
    ]
    for (const state of expectedStates) {
      expect(STATE_CSS_CLASSES[state]).toBe(`sprite-${state}`)
    }
  })
})
