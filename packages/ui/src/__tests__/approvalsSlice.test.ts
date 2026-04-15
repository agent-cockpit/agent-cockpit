import { describe, it, expect } from 'vitest'
import { applyEventToApprovals, EMPTY_APPROVALS } from '../store/approvalsSlice.js'
import type { ApprovalsSlice } from '../store/approvalsSlice.js'

// Helper to build an empty approvals state
function emptyState(): Pick<ApprovalsSlice, 'pendingApprovalsBySession'> {
  return { pendingApprovalsBySession: {} }
}

const SESSION_ID = '00000000-0000-0000-0000-000000000001'
const SESSION_ID_2 = '00000000-0000-0000-0000-000000000002'
const APPROVAL_ID_1 = 'aaaaaaaa-0000-0000-0000-000000000001'
const APPROVAL_ID_2 = 'aaaaaaaa-0000-0000-0000-000000000002'
const T0 = '2026-01-01T00:00:00.000Z'

const BASE_APPROVAL_REQUEST = {
  schemaVersion: 1 as const,
  sessionId: SESSION_ID,
  timestamp: T0,
  type: 'approval_request' as const,
  approvalId: APPROVAL_ID_1,
  actionType: 'shell_command' as const,
  riskLevel: 'high' as const,
  proposedAction: 'rm -rf /tmp/foo',
}

describe('applyEventToApprovals', () => {
  it('adds a PendingApproval to pendingApprovalsBySession[sessionId] on approval_request', () => {
    const state = applyEventToApprovals(emptyState(), BASE_APPROVAL_REQUEST)

    expect(state.pendingApprovalsBySession[SESSION_ID]).toBeDefined()
    expect(state.pendingApprovalsBySession[SESSION_ID]).toHaveLength(1)
    expect(state.pendingApprovalsBySession[SESSION_ID]![0]!.approvalId).toBe(APPROVAL_ID_1)
    expect(state.pendingApprovalsBySession[SESSION_ID]![0]!.proposedAction).toBe('rm -rf /tmp/foo')
  })

  it('appends a second approval_request for the same session (does not replace)', () => {
    const event1 = { ...BASE_APPROVAL_REQUEST, approvalId: APPROVAL_ID_1 }
    const event2 = { ...BASE_APPROVAL_REQUEST, approvalId: APPROVAL_ID_2 }

    let state = applyEventToApprovals(emptyState(), event1)
    state = applyEventToApprovals(state, event2)

    expect(state.pendingApprovalsBySession[SESSION_ID]).toHaveLength(2)
    expect(state.pendingApprovalsBySession[SESSION_ID]![0]!.approvalId).toBe(APPROVAL_ID_1)
    expect(state.pendingApprovalsBySession[SESSION_ID]![1]!.approvalId).toBe(APPROVAL_ID_2)
  })

  it('ignores a duplicate approvalId (dedup — simulates catch-up replay)', () => {
    let state = applyEventToApprovals(emptyState(), BASE_APPROVAL_REQUEST)
    const stateBefore = state
    // Apply same approvalId again
    state = applyEventToApprovals(state, BASE_APPROVAL_REQUEST)

    // Same object reference returned (no change)
    expect(state).toBe(stateBefore)
    expect(state.pendingApprovalsBySession[SESSION_ID]).toHaveLength(1)
  })

  it('removes the matching approvalId on approval_resolved', () => {
    let state = applyEventToApprovals(emptyState(), BASE_APPROVAL_REQUEST)

    const resolvedEvent = {
      schemaVersion: 1 as const,
      sessionId: SESSION_ID,
      timestamp: T0,
      type: 'approval_resolved' as const,
      approvalId: APPROVAL_ID_1,
      decision: 'approved' as const,
    }

    state = applyEventToApprovals(state, resolvedEvent)

    expect(state.pendingApprovalsBySession[SESSION_ID]).toHaveLength(0)
  })

  it('returns state unchanged on approval_resolved for unknown sessionId', () => {
    const initialState = emptyState()

    const resolvedEvent = {
      schemaVersion: 1 as const,
      sessionId: SESSION_ID_2,
      timestamp: T0,
      type: 'approval_resolved' as const,
      approvalId: APPROVAL_ID_1,
      decision: 'denied' as const,
    }

    const state = applyEventToApprovals(initialState, resolvedEvent)

    // State should still be returned (empty session list for SESSION_ID_2)
    expect(state.pendingApprovalsBySession[SESSION_ID_2]).toHaveLength(0)
  })

  it('returns state unchanged on unrelated event type', () => {
    const initialState = emptyState()

    const unrelatedEvent = {
      schemaVersion: 1 as const,
      sessionId: SESSION_ID,
      timestamp: T0,
      type: 'tool_call' as const,
      toolName: 'bash',
      input: { command: 'ls' },
    }

    const state = applyEventToApprovals(initialState, unrelatedEvent)

    // Same object reference returned
    expect(state).toBe(initialState)
  })

  it('EMPTY_APPROVALS is a stable reference (same object identity across calls)', () => {
    const ref1 = EMPTY_APPROVALS
    const ref2 = EMPTY_APPROVALS
    expect(ref1).toBe(ref2)
    expect(Array.isArray(ref1)).toBe(true)
    expect(ref1).toHaveLength(0)
  })

  it('replay convergence: approval_request + approval_resolved replayed out-of-order converges to empty pending', () => {
    // Simulate catch-up: resolved arrives before request (out-of-order replay)
    const resolvedEvent = {
      schemaVersion: 1 as const,
      sessionId: SESSION_ID,
      timestamp: T0,
      type: 'approval_resolved' as const,
      approvalId: APPROVAL_ID_1,
      decision: 'approved' as const,
    }

    // First apply the resolved (out-of-order — resolved before request)
    let state = applyEventToApprovals(emptyState(), resolvedEvent)
    // No pending items (resolved for unknown approval is idempotent)
    expect(state.pendingApprovalsBySession[SESSION_ID]).toHaveLength(0)

    // Then apply the request (arrives late)
    state = applyEventToApprovals(state, BASE_APPROVAL_REQUEST)
    // The request was already resolved — but since we don't track resolved approvals
    // in the current model, it would show as pending. This test documents the current
    // convergence guarantee: a subsequent approval_resolved clears it.
    const stateAfterRequest = state
    expect(stateAfterRequest.pendingApprovalsBySession[SESSION_ID]).toHaveLength(1)

    // Apply resolved again (idempotent replay) — clears the pending card
    state = applyEventToApprovals(state, resolvedEvent)
    expect(state.pendingApprovalsBySession[SESSION_ID]).toHaveLength(0)
  })

  it('late approval_resolved for already-resolved approvalId does not crash or corrupt state', () => {
    let state = applyEventToApprovals(emptyState(), BASE_APPROVAL_REQUEST)

    const resolvedEvent = {
      schemaVersion: 1 as const,
      sessionId: SESSION_ID,
      timestamp: T0,
      type: 'approval_resolved' as const,
      approvalId: APPROVAL_ID_1,
      decision: 'approved' as const,
    }

    // First resolution
    state = applyEventToApprovals(state, resolvedEvent)
    expect(state.pendingApprovalsBySession[SESSION_ID]).toHaveLength(0)

    // Second (late) resolution — must not throw or add stale entries
    state = applyEventToApprovals(state, resolvedEvent)
    expect(state.pendingApprovalsBySession[SESSION_ID]).toHaveLength(0)
  })
})
