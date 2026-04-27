import type { NormalizedEvent } from '@agentcockpit/shared'
import type { PopupTabId } from '../store/index.js'

export type NotificationMode = 'off' | 'in_app' | 'browser'
export type NotificationUrgency = 'low' | 'normal' | 'critical'

export interface CockpitNotificationPayload {
  title: string
  body: string
  dedupeKey: string
  urgency: NotificationUrgency
  sessionId?: string
  preferredTab?: PopupTabId
}

function eventSequence(event: NormalizedEvent & { sequenceNumber?: number }): string {
  return typeof event.sequenceNumber === 'number'
    ? String(event.sequenceNumber)
    : event.timestamp
}

export function shouldNotifyOS(visibilityState: DocumentVisibilityState | 'hidden' | 'visible'): boolean {
  return visibilityState === 'hidden'
}

export function buildNotificationPayload(
  event: NormalizedEvent & { sequenceNumber?: number },
): CockpitNotificationPayload | null {
  if (event.type === 'approval_request') {
    return {
      title: 'Approval needed',
      body: event.proposedAction || 'Agent is waiting for your decision',
      dedupeKey: `approval:${event.approvalId}`,
      urgency: 'critical',
      sessionId: event.sessionId,
      preferredTab: 'approvals',
    }
  }

  if (event.type === 'session_end') {
    const failed = typeof event.exitCode === 'number' && event.exitCode !== 0
    return {
      title: failed ? 'Session failed' : 'Session completed',
      body: event.sessionId.slice(0, 8),
      dedupeKey: `session_end:${event.sessionId}:${eventSequence(event)}`,
      urgency: failed ? 'normal' : 'low',
      sessionId: event.sessionId,
      preferredTab: failed ? 'timeline' : 'diff',
    }
  }

  if (event.type === 'provider_parse_error') {
    return {
      title: 'Provider parse error',
      body: event.errorMessage,
      dedupeKey: `provider_parse_error:${event.sessionId}:${eventSequence(event)}`,
      urgency: 'normal',
      sessionId: event.sessionId,
      preferredTab: 'timeline',
    }
  }

  if (event.type === 'session_chat_error') {
    return {
      title: 'Provider message failed',
      body: event.reason,
      dedupeKey: `session_chat_error:${event.sessionId}:${eventSequence(event)}`,
      urgency: 'normal',
      sessionId: event.sessionId,
      preferredTab: 'chat',
    }
  }

  if (event.type === 'subagent_complete') {
    return {
      title: event.success ? 'Subagent returned' : 'Subagent failed',
      body: event.subagentSessionId.slice(0, 8),
      dedupeKey: `subagent_complete:${event.sessionId}:${event.subagentSessionId}:${eventSequence(event)}`,
      urgency: event.success ? 'low' : 'normal',
      sessionId: event.sessionId,
      preferredTab: 'timeline',
    }
  }

  return null
}
