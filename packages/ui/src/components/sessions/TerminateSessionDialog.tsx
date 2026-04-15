interface TerminateSessionDialogProps {
  open: boolean
  sessionName: string
  provider: 'claude' | 'codex'
  isProcessing?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function TerminateSessionDialog({
  open,
  sessionName,
  provider,
  isProcessing = false,
  onCancel,
  onConfirm,
}: TerminateSessionDialogProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(16,28,40,0.72),rgba(3,8,17,0.9))] px-4 backdrop-blur-[1px]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="terminate-dialog-title"
      aria-describedby="terminate-dialog-description"
    >
      <div className="cockpit-frame-full w-full max-w-md rounded-none border border-red-500/55 bg-[var(--color-panel-surface)] shadow-[0_0_24px_rgba(239,68,68,0.28),0_14px_46px_rgba(0,0,0,0.7)]">
        <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
        <span className="cockpit-corner cockpit-corner-tr" aria-hidden />
        <span className="cockpit-corner cockpit-corner-bl" aria-hidden />
        <span className="cockpit-corner cockpit-corner-br" aria-hidden />

        <div className="flex items-center gap-2 border-b border-red-500/35 px-4 py-3">
          <p
            id="terminate-dialog-title"
            className="[font-family:var(--font-mono-data)] text-[11px] font-semibold uppercase tracking-[0.18em] text-red-300"
          >
            Confirm Termination
          </p>
          <span
            className={`ml-auto rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${provider === 'claude' ? 'badge-provider-claude' : 'badge-provider-codex'}`}
          >
            {provider}
          </span>
        </div>

        <div className="space-y-3 px-4 py-4">
          <p
            id="terminate-dialog-description"
            className="[font-family:var(--font-mono-data)] text-xs text-foreground"
          >
            Terminate session <span className="text-red-300">&quot;{sessionName}&quot;</span> now?
          </p>
          <p className="[font-family:var(--font-mono-data)] text-[11px] text-[var(--color-cockpit-dim)]">
            This stops the active runtime and closes this session immediately.
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
            disabled={isProcessing}
            className="cockpit-btn min-w-32 border-red-500/70 text-red-300 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isProcessing ? 'Terminating...' : 'Terminate Session'}
          </button>
        </div>
      </div>
    </div>
  )
}
