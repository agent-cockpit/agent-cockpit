import type { NormalizedEvent } from '@agentcockpit/shared'
import type { AppStore, SessionRecord } from './index.js'
import type { CharacterType } from '../components/office/characterMapping.js'

/**
 * Pure reducer: applies a single NormalizedEvent to the sessions map.
 * Called by the Zustand store's applyEvent action.
 *
 * SESS-03 attach-to-running-session: When lastSeenSequence=0, the daemon
 * replays ALL historical events from the beginning. This function is pure and
 * replay-safe — replaying a sequence of events produces the same result as
 * applying them in order from scratch.
 */
export function applyEventToSessions(
  state: Pick<AppStore, 'sessions'>,
  event: NormalizedEvent,
  character?: CharacterType,
): Pick<AppStore, 'sessions'> {
  const sessions = { ...state.sessions }
  const now = event.timestamp

  switch (event.type) {
    case 'session_start':
      sessions[event.sessionId] = {
        sessionId: event.sessionId,
        provider: event.provider,
        workspacePath: event.workspacePath,
        startedAt: event.timestamp,
        status: 'active',
        lastEventAt: now,
        pendingApprovals: 0,
        character: character ?? 'astronaut',
        managedByDaemon: event.managedByDaemon ?? (event.provider === 'codex'),
        canSendMessage: event.canSendMessage ?? (event.provider === 'codex'),
        canTerminateSession: event.canTerminateSession ?? (event.provider === 'codex'),
        reason: event.reason,
        branch: event.branch,
        taskTitle: event.taskTitle,
        projectId: event.projectId,
        childSessionIds: [],
      }
      break

    case 'session_end':
      if (sessions[event.sessionId]) {
        sessions[event.sessionId] = {
          ...sessions[event.sessionId]!,
          status: 'ended',
          lastEventAt: now,
        }
      }
      // No-op for unknown sessionId — do not create phantom records
      break

    case 'session_resumed':
      if (sessions[event.sessionId]) {
        sessions[event.sessionId] = {
          ...sessions[event.sessionId]!,
          status: 'active',
          lastEventAt: now,
          managedByDaemon: true,
          canSendMessage: true,
          canTerminateSession: true,
        }
      }
      break

    case 'subagent_spawn':
      if (sessions[event.sessionId]) {
        const parent = sessions[event.sessionId]!
        const childSessionIds = new Set(parent.childSessionIds ?? [])
        childSessionIds.add(event.subagentSessionId)
        sessions[event.sessionId] = {
          ...parent,
          childSessionIds: Array.from(childSessionIds),
          lastEventAt: now,
        }
      }
      if (sessions[event.subagentSessionId]) {
        sessions[event.subagentSessionId] = {
          ...sessions[event.subagentSessionId]!,
          parentSessionId: event.sessionId,
          lastEventAt: now,
        }
      }
      break

    case 'approval_request':
      if (sessions[event.sessionId]) {
        sessions[event.sessionId] = {
          ...sessions[event.sessionId]!,
          pendingApprovals: (sessions[event.sessionId]!.pendingApprovals ?? 0) + 1,
          lastEventAt: now,
        }
      }
      break

    case 'approval_resolved':
      if (sessions[event.sessionId]) {
        const prev = sessions[event.sessionId]!
        sessions[event.sessionId] = {
          ...prev,
          pendingApprovals: Math.max(0, prev.pendingApprovals - 1),
          lastEventAt: now,
        }
      }
      break

    case 'session_chat_error':
      if (sessions[event.sessionId]) {
        sessions[event.sessionId] = {
          ...sessions[event.sessionId]!,
          reason: event.reason,
          lastEventAt: now,
        }
      }
      break

    default:
      // All other event types: update lastEventAt only if session exists
      if (sessions[event.sessionId]) {
        sessions[event.sessionId] = {
          ...sessions[event.sessionId]!,
          lastEventAt: now,
        }
      }
      break
  }

  return { sessions }
}
