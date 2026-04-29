import { describe, it, expect } from 'vitest'
import { applyEventToSessions } from '../store/sessionsSlice.js'
import type { AppStore } from '../store/index.js'

// Helper to build an empty sessions state
function emptyState(): Pick<AppStore, 'sessions'> {
  return { sessions: {} }
}

const SESSION_ID = '00000000-0000-0000-0000-000000000001'
const CHILD_SESSION_ID = '00000000-0000-0000-0000-000000000002'
const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-01T00:01:00.000Z'
const T2 = '2026-01-01T00:02:00.000Z'

describe('applyEventToSessions', () => {
  it('creates a SessionRecord with status active and pendingApprovals=0 on session_start', () => {
    const state = applyEventToSessions(emptyState(), {
      type: 'session_start',
      sessionId: SESSION_ID,
      provider: 'claude',
      workspacePath: '/projects/foo',
      projectId: 'foo-12345678',
      timestamp: T0,
      schemaVersion: 1,
    })

    expect(state.sessions[SESSION_ID]).toBeDefined()
    expect(state.sessions[SESSION_ID]!.status).toBe('active')
    expect(state.sessions[SESSION_ID]!.pendingApprovals).toBe(0)
    expect(state.sessions[SESSION_ID]!.provider).toBe('claude')
    expect(state.sessions[SESSION_ID]!.workspacePath).toBe('/projects/foo')
    expect(state.sessions[SESSION_ID]!.projectId).toBe('foo-12345678')
    expect(state.sessions[SESSION_ID]!.startedAt).toBe(T0)
  })

  it('sets status to ended on session_end for existing session', () => {
    let state = applyEventToSessions(emptyState(), {
      type: 'session_start',
      sessionId: SESSION_ID,
      provider: 'claude',
      workspacePath: '/projects/foo',
      timestamp: T0,
      schemaVersion: 1,
    })
    state = applyEventToSessions(state, {
      type: 'session_end',
      sessionId: SESSION_ID,
      provider: 'claude',
      timestamp: T1,
      schemaVersion: 1,
    })

    expect(state.sessions[SESSION_ID]!.status).toBe('ended')
    expect(state.sessions[SESSION_ID]!.lastEventAt).toBe(T1)
  })

  it('increments pendingApprovals on approval_request', () => {
    let state = applyEventToSessions(emptyState(), {
      type: 'session_start',
      sessionId: SESSION_ID,
      provider: 'claude',
      workspacePath: '/projects/foo',
      timestamp: T0,
      schemaVersion: 1,
    })
    state = applyEventToSessions(state, {
      type: 'approval_request',
      sessionId: SESSION_ID,
      approvalId: '00000000-0000-0000-0000-000000000099',
      actionType: 'shell_command',
      riskLevel: 'high',
      proposedAction: 'rm -rf',
      timestamp: T1,
      schemaVersion: 1,
    })

    expect(state.sessions[SESSION_ID]!.pendingApprovals).toBe(1)
  })

  it('decrements pendingApprovals on approval_resolved (floor at 0)', () => {
    let state = applyEventToSessions(emptyState(), {
      type: 'session_start',
      sessionId: SESSION_ID,
      provider: 'claude',
      workspacePath: '/projects/foo',
      timestamp: T0,
      schemaVersion: 1,
    })
    state = applyEventToSessions(state, {
      type: 'approval_request',
      sessionId: SESSION_ID,
      approvalId: '00000000-0000-0000-0000-000000000099',
      actionType: 'shell_command',
      riskLevel: 'high',
      proposedAction: 'rm -rf',
      timestamp: T1,
      schemaVersion: 1,
    })
    state = applyEventToSessions(state, {
      type: 'approval_resolved',
      sessionId: SESSION_ID,
      approvalId: '00000000-0000-0000-0000-000000000099',
      decision: 'approved',
      timestamp: T2,
      schemaVersion: 1,
    })

    expect(state.sessions[SESSION_ID]!.pendingApprovals).toBe(0)

    // Floor at 0: resolving again should not go negative
    state = applyEventToSessions(state, {
      type: 'approval_resolved',
      sessionId: SESSION_ID,
      approvalId: '00000000-0000-0000-0000-000000000099',
      decision: 'approved',
      timestamp: T2,
      schemaVersion: 1,
    })
    expect(state.sessions[SESSION_ID]!.pendingApprovals).toBe(0)
  })

  it('updates lastEventAt only for unrecognized event type on known session', () => {
    let state = applyEventToSessions(emptyState(), {
      type: 'session_start',
      sessionId: SESSION_ID,
      provider: 'claude',
      workspacePath: '/projects/foo',
      timestamp: T0,
      schemaVersion: 1,
    })
    const statusBefore = state.sessions[SESSION_ID]!.status

    state = applyEventToSessions(state, {
      type: 'tool_call',
      sessionId: SESSION_ID,
      toolName: 'bash',
      input: { command: 'ls' },
      timestamp: T1,
      schemaVersion: 1,
    })

    expect(state.sessions[SESSION_ID]!.status).toBe(statusBefore)
    expect(state.sessions[SESSION_ID]!.lastEventAt).toBe(T1)
  })

  it('records subagent child and parent session ids when both sessions are known', () => {
    let state = applyEventToSessions(emptyState(), {
      type: 'session_start',
      sessionId: SESSION_ID,
      provider: 'claude',
      workspacePath: '/projects/foo',
      timestamp: T0,
      schemaVersion: 1,
    })
    state = applyEventToSessions(state, {
      type: 'session_start',
      sessionId: CHILD_SESSION_ID,
      provider: 'claude',
      workspacePath: '/projects/foo',
      timestamp: T1,
      schemaVersion: 1,
    })
    state = applyEventToSessions(state, {
      type: 'subagent_spawn',
      sessionId: SESSION_ID,
      subagentSessionId: CHILD_SESSION_ID,
      timestamp: T2,
      schemaVersion: 1,
    })

    expect(state.sessions[SESSION_ID]!.childSessionIds).toEqual([CHILD_SESSION_ID])
    expect(state.sessions[CHILD_SESSION_ID]!.parentSessionId).toBe(SESSION_ID)
  })

  it('does not create a new record when session_end targets unknown sessionId', () => {
    const state = applyEventToSessions(emptyState(), {
      type: 'session_end',
      sessionId: SESSION_ID,
      provider: 'claude',
      timestamp: T0,
      schemaVersion: 1,
    })

    expect(Object.keys(state.sessions)).toHaveLength(0)
  })

  it('SESS-03: replaying a sequence from sequenceNumber=0 builds correct session state', () => {
    // Simulate daemon catch-up: UI opens while session is already running
    // lastSeenSequence=0 → daemon replays ALL events from the beginning
    const events = [
      {
        type: 'session_start' as const,
        sessionId: SESSION_ID,
        provider: 'claude' as const,
        workspacePath: '/projects/foo',
        timestamp: T0,
        schemaVersion: 1 as const,
        sequenceNumber: 1,
      },
      {
        type: 'tool_call' as const,
        sessionId: SESSION_ID,
        toolName: 'bash',
        input: { command: 'ls' },
        timestamp: T1,
        schemaVersion: 1 as const,
        sequenceNumber: 2,
      },
      {
        type: 'approval_request' as const,
        sessionId: SESSION_ID,
        approvalId: '00000000-0000-0000-0000-000000000099',
        actionType: 'shell_command' as const,
        riskLevel: 'high' as const,
        proposedAction: 'rm -rf',
        timestamp: T2,
        schemaVersion: 1 as const,
        sequenceNumber: 3,
      },
    ]

    let state = emptyState()
    for (const event of events) {
      state = applyEventToSessions(state, event)
    }

    // All prior events applied — session fully reconstructed
    expect(state.sessions[SESSION_ID]).toBeDefined()
    expect(state.sessions[SESSION_ID]!.status).toBe('active')
    expect(state.sessions[SESSION_ID]!.pendingApprovals).toBe(1)
    expect(state.sessions[SESSION_ID]!.workspacePath).toBe('/projects/foo')
    expect(state.sessions[SESSION_ID]!.lastEventAt).toBe(T2)
  })
})
