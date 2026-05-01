import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { NormalizedEvent } from '@agentcockpit/shared'
import { buildNotificationPayload } from '../lib/notifications.js'
import { useStore } from '../store/index.js'

function approvalEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    schemaVersion: 1,
    sequenceNumber: 12,
    sessionId: 'aaaaaaaa-0000-0000-0000-000000000001',
    timestamp: '2026-01-01T00:00:00.000Z',
    type: 'approval_request',
    approvalId: 'bbbbbbbb-0000-0000-0000-000000000002',
    actionType: 'shell_command',
    riskLevel: 'high',
    proposedAction: 'Bash: pnpm test',
    affectedPaths: [],
    whyRisky: 'runs a command',
    ...overrides,
  } as NormalizedEvent
}

describe('notifications', () => {
  beforeEach(() => {
    useStore.setState({
      notifications: [],
      notificationMode: 'in_app',
      unreadNotificationCount: 0,
    })
  })

  it('builds approval notifications with approval dedupe and approvals tab target', () => {
    const payload = buildNotificationPayload(approvalEvent())
    expect(payload).toMatchObject({
      title: 'Approval needed',
      body: 'Bash: pnpm test',
      dedupeKey: 'approval:bbbbbbbb-0000-0000-0000-000000000002',
      sessionId: 'aaaaaaaa-0000-0000-0000-000000000001',
      preferredTab: 'approvals',
      urgency: 'critical',
    })
  })

  it('dedupes notifications by dedupe key in the store', () => {
    const payload = buildNotificationPayload(approvalEvent())
    expect(payload).not.toBeNull()

    const first = useStore.getState().addNotification(payload!)
    const second = useStore.getState().addNotification(payload!)

    expect(first).not.toBeNull()
    expect(second).toBeNull()
    expect(useStore.getState().notifications).toHaveLength(1)
    expect(useStore.getState().unreadNotificationCount).toBe(1)
  })

  it('does not store notifications when mode is off', () => {
    useStore.getState().setNotificationMode('off')
    const payload = buildNotificationPayload(approvalEvent())
    const inserted = useStore.getState().addNotification(payload!)

    expect(inserted).toBeNull()
    expect(useStore.getState().notifications).toHaveLength(0)
  })

  it('defaults notification mode to browser when no preference is stored', async () => {
    localStorage.removeItem('cockpit.notifications.mode.v1')
    vi.resetModules()
    const mod = await import('../store/index.js')
    expect(mod.useStore.getState().notificationMode).toBe('browser')
  })
})
