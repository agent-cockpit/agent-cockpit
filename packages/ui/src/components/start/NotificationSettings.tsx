import type { NotificationMode } from '../../lib/notifications.js'
import { useStore } from '../../store/index.js'

function permissionLabel(): string {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'not supported'
  return Notification.permission
}

export function NotificationSettings() {
  const notificationMode = useStore((state) => state.notificationMode)
  const setNotificationMode = useStore((state) => state.setNotificationMode)

  async function handleModeChange(mode: NotificationMode): Promise<void> {
    if (
      mode === 'browser' &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'default'
    ) {
      await Notification.requestPermission().catch(() => 'denied')
    }
    setNotificationMode(mode)
  }

  return (
    <section className="cockpit-frame-full border border-border/60 bg-[var(--color-panel-surface)] px-3 py-3">
      <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
      <span className="cockpit-corner cockpit-corner-br" aria-hidden />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="cockpit-label">NOTIFICATIONS</h3>
          <p className="data-readout-dim mt-1 text-[10px]">
            Browser permission: {permissionLabel()}
          </p>
        </div>
        <select
          value={notificationMode}
          onChange={(event) => void handleModeChange(event.target.value as NotificationMode)}
          className="rounded-none border border-[var(--color-cockpit-cyan)]/30 bg-background px-2 py-1 text-[10px] [font-family:var(--font-mono-data)] uppercase text-foreground focus:outline-none focus:border-[var(--color-cockpit-cyan)]/60"
          aria-label="Notification mode"
          data-testid="notification-mode"
        >
          <option value="browser">Browser</option>
          <option value="in_app">In-app only</option>
          <option value="off">Off</option>
        </select>
      </div>
    </section>
  )
}
