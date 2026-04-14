import {
  CHARACTER_TYPES,
  characterFaceUrl,
  type CharacterType,
} from '../office/characterMapping.js'

interface CharacterPickerProps {
  value: CharacterType
  onChange: (character: CharacterType) => void
  onConfirm: () => void
}

function formatCharacterName(character: CharacterType): string {
  return character
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function CharacterPicker({ value, onChange, onConfirm }: CharacterPickerProps) {
  const currentIndex = CHARACTER_TYPES.indexOf(value)
  const safeIndex = currentIndex >= 0 ? currentIndex : 0
  const previousCharacter =
    CHARACTER_TYPES[(safeIndex - 1 + CHARACTER_TYPES.length) % CHARACTER_TYPES.length]
  const nextCharacter = CHARACTER_TYPES[(safeIndex + 1) % CHARACTER_TYPES.length]
  const label = formatCharacterName(CHARACTER_TYPES[safeIndex])

  return (
    <section className="cockpit-frame-full rounded-none border border-border/70 bg-[var(--color-panel-surface)] px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="cockpit-label">Character Select</p>
        <span className="data-readout-dim text-[10px] uppercase tracking-[0.18em]">
          {safeIndex + 1}/{CHARACTER_TYPES.length}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(previousCharacter)}
          className="cockpit-btn h-12 w-12 px-0 text-lg leading-none"
          aria-label="Previous character"
        >
          {'[<]'}
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-3 border border-border/60 bg-background/70 px-3 py-3">
          <img
            src={characterFaceUrl(CHARACTER_TYPES[safeIndex])}
            alt={`${label} face portrait`}
            className="h-16 w-16 shrink-0 border border-border/60 object-cover image-render-pixel"
          />

          <div className="min-w-0">
            <p className="cockpit-label text-sm">{label}</p>
            <p className="data-readout-dim mt-1 text-[10px] uppercase tracking-[0.18em]">
              Pilot Profile Ready
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onChange(nextCharacter)}
          className="cockpit-btn h-12 w-12 px-0 text-lg leading-none"
          aria-label="Next character"
        >
          {'[>]'}
        </button>
      </div>

      <button
        type="button"
        onClick={onConfirm}
        className="cockpit-btn mt-4 w-full justify-center px-3 py-2 text-xs uppercase tracking-[0.2em]"
        aria-label="Confirm character"
      >
        Confirm
      </button>
    </section>
  )
}
