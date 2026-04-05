/**
 * Browser-side notification helpers.
 *
 * This module is pure TypeScript with no browser-specific globals so it can be
 * tested in Node. The browser UI (Phase 3) imports and uses these at runtime.
 *
 * Usage in browser WebSocket message handler (Phase 3):
 *   const payload = buildNotificationPayload(event);
 *   if (payload && shouldNotifyOS(document.visibilityState)) {
 *     new Notification(payload.title, { body: payload.body, tag: payload.tag });
 *   }
 *   // For in-app (NOTIF-01): always show toast/badge regardless of visibilityState
 */

export interface NotificationPayload {
  title: string;
  body: string;
  tag: string;       // for deduplication (e.g. approvalId or sessionId)
  urgency: 'low' | 'normal' | 'critical';
}

/**
 * Determines whether to fire an OS-level notification based on visibility state.
 * visibilityState is injected so this is testable in Node without DOM.
 */
export function shouldNotifyOS(
  visibilityState: DocumentVisibilityState | 'hidden' | 'visible',
): boolean {
  return visibilityState === 'hidden';
}

/**
 * Builds the OS notification payload for a given NormalizedEvent type.
 * Returns null if the event type does not warrant an OS notification.
 */
export function buildNotificationPayload(
  event: { type: string; [key: string]: unknown },
): NotificationPayload | null {
  if (event['type'] === 'approval_request') {
    return {
      title: 'Approval needed',
      body: String(event['proposedAction'] ?? 'Agent is waiting for your decision'),
      tag: String(event['approvalId'] ?? ''),
      urgency: 'critical',
    };
  }
  if (event['type'] === 'session_end') {
    const status = event['status'] ?? 'completed';
    return {
      title: status === 'failed' ? 'Session failed' : 'Session completed',
      body: String(event['sessionId'] ?? ''),
      tag: String(event['sessionId'] ?? ''),
      urgency: status === 'failed' ? 'normal' : 'low',
    };
  }
  return null;
}
