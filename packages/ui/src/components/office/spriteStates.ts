import type { NormalizedEvent } from '@agentcockpit/shared'
import type { SessionRecord } from '../../store/index.js'

export type Direction =
  | 'south'
  | 'north'
  | 'east'
  | 'west'
  | 'south-east'
  | 'south-west'
  | 'north-east'
  | 'north-west'

export type AnimationState = 'idle' | 'blocked' | 'completed' | 'failed' | 'walk'

export const DIRECTION_ROWS: Record<Direction, number> = {
  south: 0,
  north: 1,
  east: 2,
  west: 3,
  'south-east': 4,
  'south-west': 5,
  'north-east': 6,
  'north-west': 7,
}

export const STATE_ROW_OFFSET: Record<AnimationState, number> = {
  idle: 0,
  blocked: 8,
  completed: 16,
  failed: 24,
  walk: 32,
}

export type AgentAnimState =
  | 'planning'
  | 'coding'
  | 'reading'
  | 'testing'
  | 'waiting'
  | 'blocked'
  | 'completed'
  | 'failed'

export const COLOR_STATE_TO_ANIMATION: Record<AgentAnimState, AnimationState> = {
  planning: 'idle',
  coding: 'idle',
  reading: 'idle',
  testing: 'idle',
  waiting: 'idle',
  blocked: 'blocked',
  completed: 'completed',
  failed: 'failed',
}

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

    case 'tool_call':
    case 'tool_called': {
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
