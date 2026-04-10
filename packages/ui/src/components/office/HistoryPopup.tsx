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
                     w-[90vw] max-w-6xl h-[85vh] bg-background rounded-lg shadow-2xl
                     flex flex-col overflow-hidden border border-border"
          aria-label="Session History"
        >
          <div className="flex items-center px-4 py-3 border-b border-border shrink-0">
            <Dialog.Title className="text-sm font-semibold">History</Dialog.Title>
            <Dialog.Close
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              ✕
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-auto">
            <HistoryPage />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
