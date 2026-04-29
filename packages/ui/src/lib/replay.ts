import type { NormalizedEvent } from '@agentcockpit/shared'
import { applyEventToApprovals, type PendingApproval } from '../store/approvalsSlice.js'

export function sliceEventsForReplay(events: NormalizedEvent[], cursor: number | null): NormalizedEvent[] {
  if (cursor === null) return events
  if (events.length === 0) return events
  const endIndex = Math.min(events.length, Math.max(0, cursor) + 1)
  return events.slice(0, endIndex)
}

export function formatReplayCursor(cursor: number | null, total: number): string {
  if (total === 0) return '0 / 0'
  if (cursor === null) return `Live · ${total}`
  return `${Math.min(cursor + 1, total)} / ${total}`
}

export function derivePendingApprovalsBySession(
  events: NormalizedEvent[],
): Record<string, PendingApproval[]> {
  let pendingApprovalsBySession: Record<string, PendingApproval[]> = {}

  for (const event of events) {
    const next = applyEventToApprovals({ pendingApprovalsBySession }, event)
    pendingApprovalsBySession = next.pendingApprovalsBySession
  }

  return pendingApprovalsBySession
}
