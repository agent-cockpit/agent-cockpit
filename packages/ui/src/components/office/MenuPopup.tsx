import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, useState } from 'react'
import { useAudioSettings, audioSystem } from '../../audio/audioSystem.js'
import { CharacterPicker } from '../sessions/CharacterPicker.js'
import { useStore } from '../../store/index.js'
import type { CharacterType } from './characterMapping.js'

interface Props {
  open: boolean
  onClose: () => void
}

export function MenuPopup({ open, onClose }: Props) {
  const audioSettings = useAudioSettings()
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
    if (open) {
      setDraftCharacter(selectedPlayerCharacter)
    }
  }, [open, selectedPlayerCharacter])

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/45 z-40" />
        <Dialog.Content
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                     w-[92vw] max-w-md bg-background rounded-none
                     flex flex-col overflow-hidden border border-border/80
                     shadow-[0_0_40px_rgba(34,211,238,0.08),0_20px_60px_rgba(0,0,0,0.6)]"
          aria-label="Game Menu"
        >
          <div className="cockpit-frame-full flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 bg-[var(--color-panel-surface)]">
            <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
            <span className="cockpit-corner cockpit-corner-tr" aria-hidden />
            <span className="cockpit-corner cockpit-corner-bl" aria-hidden />
            <span className="cockpit-corner cockpit-corner-br" aria-hidden />
            <Dialog.Title className="cockpit-label">GAME MENU</Dialog.Title>
            <Dialog.Close
              className="ml-auto cockpit-label hover:text-foreground transition-colors px-2 py-1"
              aria-label="Close menu"
            >
              [X]
            </Dialog.Close>
          </div>

          <div className="p-4 space-y-4">
            <CharacterPicker
              value={draftCharacter}
              onChange={setDraftCharacter}
              onConfirm={() => {
                setSelectedPlayerCharacter(draftCharacter)
                onClose()
              }}
            />

            <section className="cockpit-frame-full rounded-none border border-border/70 bg-[var(--color-panel-surface)] px-3 py-3">
              <p className="cockpit-label mb-3">AUDIO</p>
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="data-readout-dim text-[11px]">MASTER AUDIO</span>
                <button
                  type="button"
                  onClick={() => audioSystem.setMuted(!audioSettings.muted)}
                  className="cockpit-btn px-2 py-1 text-[10px]"
                  aria-label={audioSettings.muted ? 'Unmute audio' : 'Mute audio'}
                >
                  {audioSettings.muted ? 'UNMUTE' : 'MUTE'}
                </button>
              </div>

              <label className="mb-2 block">
                <span className="data-readout-dim text-[10px]">MUSIC {Math.round(audioSettings.musicVolume * 100)}%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(audioSettings.musicVolume * 100)}
                  onChange={(event) => audioSystem.setMusicVolume(Number(event.currentTarget.value) / 100)}
                  className="mt-1 w-full accent-cyan-300"
                  aria-label="Music volume"
                />
              </label>

              <label className="block">
                <span className="data-readout-dim text-[10px]">SFX {Math.round(audioSettings.sfxVolume * 100)}%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(audioSettings.sfxVolume * 100)}
                  onChange={(event) => audioSystem.setSfxVolume(Number(event.currentTarget.value) / 100)}
                  className="mt-1 w-full accent-cyan-300"
                  aria-label="SFX volume"
                />
              </label>
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
