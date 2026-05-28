import * as Dialog from '@radix-ui/react-dialog'
import { StatsPage } from '../../pages/StatsPage.js'

interface Props {
  open: boolean
  onClose: () => void
}

export function StatsPopup({ open, onClose }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                     w-[90vw] max-w-5xl h-[85vh] bg-background rounded-2xl
                     flex flex-col overflow-hidden border border-border/80
                     shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
          aria-label="Usage Stats"
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 bg-[var(--color-panel-surface)]">
            <Dialog.Title className="cockpit-label">Usage Stats</Dialog.Title>
            <Dialog.Close
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors px-2 py-1 text-lg leading-none"
              aria-label="Close"
            >
              ×
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-auto">
            <StatsPage />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
