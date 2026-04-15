import * as Dialog from '@radix-ui/react-dialog'
import { HistoryPage } from '../../pages/HistoryPage.js'

interface Props {
  open: boolean
  onClose: () => void
}

export function HistoryPopup({ open, onClose }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                     w-[90vw] max-w-6xl h-[85vh] bg-background rounded-none
                     flex flex-col overflow-hidden border border-border/80
                     shadow-[0_0_40px_rgba(34,211,238,0.08),0_20px_60px_rgba(0,0,0,0.6)]"
          aria-label="Session History"
        >
          <div className="cockpit-frame-full flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 bg-[var(--color-panel-surface)]">
            <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
            <span className="cockpit-corner cockpit-corner-tr" aria-hidden />
            <Dialog.Title className="cockpit-label">Session Archive</Dialog.Title>
            <Dialog.Close
              className="ml-auto cockpit-label hover:text-foreground transition-colors px-2 py-1"
              aria-label="Close"
            >
              [X]
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-auto">
            <HistoryPage onSessionOpen={onClose} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
