import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, useState } from 'react'
import { audioSystem } from '../../audio/audioSystem.js'
import { CharacterPicker } from '../sessions/CharacterPicker.js'
import { useStore } from '../../store/index.js'
import type { CharacterType } from './characterMapping.js'

interface Props {
  open: boolean
  onClose: () => void
}

export function ClosetPopup({ open, onClose }: Props) {
  const prevOpenRef = useRef(open)
  const selectedPlayerCharacter = useStore((state) => state.selectedPlayerCharacter)
  const setSelectedPlayerCharacter = useStore((state) => state.setSelectedPlayerCharacter)
  const [draftCharacter, setDraftCharacter] = useState<CharacterType>(selectedPlayerCharacter)

  useEffect(() => {
    if (prevOpenRef.current !== open) {
      audioSystem.playPopupToggle(open)
      prevOpenRef.current = open
    }
  }, [open])

  useEffect(() => {
    if (open) setDraftCharacter(selectedPlayerCharacter)
  }, [open, selectedPlayerCharacter])

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/45 z-40" />
        <Dialog.Content
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                     w-[92vw] max-w-md bg-background rounded-2xl
                     flex flex-col overflow-hidden border border-border/80
                     shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
          aria-label="Closet"
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 bg-[var(--color-panel-surface)]">
            <Dialog.Title className="cockpit-label">CLOSET</Dialog.Title>
            <Dialog.Close
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors px-2 py-1 text-lg leading-none"
              aria-label="Close closet"
            >
              ×
            </Dialog.Close>
          </div>

          <div className="p-4">
            <CharacterPicker
              value={draftCharacter}
              onChange={setDraftCharacter}
              onConfirm={() => {
                setSelectedPlayerCharacter(draftCharacter)
                onClose()
              }}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
