import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useState } from 'react'
import type { CharacterType } from '../office/characterMapping.js'
import { CharacterPicker } from '../sessions/CharacterPicker.js'
import { useStore } from '../../store/index.js'
import { NotificationSettings } from './NotificationSettings.js'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsDialog({ open, onClose }: Props) {
  const selectedPlayerCharacter = useStore((state) => state.selectedPlayerCharacter)
  const setSelectedPlayerCharacter = useStore((state) => state.setSelectedPlayerCharacter)
  const [draftCharacter, setDraftCharacter] = useState<CharacterType>(selectedPlayerCharacter)

  useEffect(() => {
    if (open) setDraftCharacter(selectedPlayerCharacter)
  }, [open, selectedPlayerCharacter])

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-[1px] z-40" />
        <Dialog.Content
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                     w-[92vw] max-w-md bg-background rounded-none
                     flex flex-col overflow-hidden border border-border/80
                     shadow-[0_0_40px_rgba(34,211,238,0.12),0_20px_60px_rgba(0,0,0,0.7)]"
          aria-label="Settings"
        >
          <div className="cockpit-frame-full flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 bg-[var(--color-panel-surface)]">
            <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
            <span className="cockpit-corner cockpit-corner-tr" aria-hidden />
            <span className="cockpit-corner cockpit-corner-bl" aria-hidden />
            <span className="cockpit-corner cockpit-corner-br" aria-hidden />
            <Dialog.Title className="cockpit-label">SETTINGS</Dialog.Title>
            <Dialog.Close
              className="ml-auto cockpit-label hover:text-foreground transition-colors px-2 py-1"
              aria-label="Close settings"
            >
              [X]
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-4 p-4">
            <section className="flex flex-col gap-2">
              <h3 className="cockpit-label">PILOT AVATAR</h3>
              <CharacterPicker
                value={draftCharacter}
                onChange={setDraftCharacter}
                onConfirm={() => {
                  setSelectedPlayerCharacter(draftCharacter)
                  onClose()
                }}
              />
            </section>

            <NotificationSettings />

            <section
              className="cockpit-frame-full border border-border/60 bg-[var(--color-panel-surface)] px-3 py-2"
              aria-label="Roadmap note"
            >
              <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
              <span className="cockpit-corner cockpit-corner-br" aria-hidden />
              <p
                className="data-readout-dim"
                style={{ fontSize: '0.62rem', lineHeight: 1.5 }}
              >
                MORE CONTROLS INCOMING — MODEL PROFILE, THEME, AGENT DEFAULTS.
              </p>
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
