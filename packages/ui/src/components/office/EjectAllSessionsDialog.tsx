interface EjectAllSessionsDialogProps {
  open: boolean
  sessionCount: number
  isProcessing?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function EjectAllSessionsDialog({
  open,
  sessionCount,
  isProcessing = false,
  onCancel,
  onConfirm,
}: EjectAllSessionsDialogProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(16,28,40,0.72),rgba(3,8,17,0.9))] px-4 backdrop-blur-[1px]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="eject-dialog-title"
      aria-describedby="eject-dialog-description"
    >
      <div className="w-full max-w-md rounded-2xl border border-cockpit-red/55 bg-[var(--color-panel-surface)] shadow-[0_14px_46px_rgba(0,0,0,0.7)] overflow-hidden">

        <div className="flex items-center gap-2 border-b border-cockpit-red/35 px-4 py-3">
          <p
            id="eject-dialog-title"
            className="[font-family:var(--font-mono-data)] text-[11px] font-semibold uppercase tracking-[0.18em] text-cockpit-red"
          >
            Emergency Eject
          </p>
        </div>

        <div className="space-y-3 px-4 py-4">
          <p
            id="eject-dialog-description"
            className="[font-family:var(--font-mono-data)] text-xs text-foreground"
          >
            Terminate all{' '}
            <span className="text-cockpit-red">
              {sessionCount} active session{sessionCount !== 1 ? 's' : ''}
            </span>{' '}
            immediately?
          </p>
          <p className="[font-family:var(--font-mono-data)] text-[11px] text-[var(--color-cockpit-dim)]">
            This stops all running agent runtimes at once. This action cannot be undone.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-border/60 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="cockpit-btn min-w-24 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing || sessionCount === 0}
            className="cockpit-btn min-w-32 border-cockpit-red/70 text-cockpit-red hover:bg-cockpit-red/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isProcessing ? 'Ejecting...' : 'Eject All'}
          </button>
        </div>
      </div>
    </div>
  )
}
