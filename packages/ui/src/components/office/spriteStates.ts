import type { NormalizedEvent } from '@cockpit/shared'
import type { SessionRecord } from '../../store/index.js'

export type AgentAnimState =
  | 'planning'
  | 'coding'
  | 'reading'
  | 'testing'
  | 'waiting'
  | 'blocked'
  | 'completed'
  | 'failed'

export const STATE_CSS_CLASSES: Record<AgentAnimState, string> = {
  planning: 'sprite-planning',
  coding: 'sprite-coding',
  reading: 'sprite-reading',
  testing: 'sprite-testing',
  waiting: 'sprite-waiting',
  blocked: 'sprite-blocked',
  completed: 'sprite-completed',
  failed: 'sprite-failed',
}

export function deriveAgentState(
  session: SessionRecord,
  lastEvent: NormalizedEvent | undefined,
): AgentAnimState {
  // Priority 1: session ended
  if (session.status === 'ended') {
    return 'completed'
  }

  // Priority 2: pending approvals
  if (session.pendingApprovals > 0) {
    return 'blocked'
  }

  // Priority 3: no last event
  if (!lastEvent) {
    return 'waiting'
  }

  // Priority 4: switch on event type
  switch (lastEvent.type) {
    case 'session_start':
      return 'planning'

    case 'tool_call': {
      const name = (lastEvent as { toolName?: string }).toolName?.toLowerCase() ?? ''
      if (/read|view|grep|search/.test(name)) return 'reading'
      if (/write|edit|create|apply/.test(name)) return 'coding'
      if (/test|run|exec|bash/.test(name)) return 'testing'
      return 'coding'
    }

    case 'file_change':
      return 'coding'

    case 'memory_read':
      return 'reading'

    case 'memory_write':
      return 'planning'

    case 'approval_request':
      return 'blocked'

    case 'provider_parse_error':
      return 'failed'

    case 'subagent_spawn':
      return 'planning'

    case 'subagent_complete':
      return 'waiting'

    default:
      return 'waiting'
  }
}
