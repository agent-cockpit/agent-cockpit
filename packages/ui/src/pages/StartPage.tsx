import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { CockpitScene } from '../components/start/CockpitScene.js'
import { StartMenu, type MenuItem } from '../components/start/StartMenu.js'
import { SettingsDialog } from '../components/start/SettingsDialog.js'
import { useStore } from '../store/index.js'

const DOCS_URL = 'https://agent-cockpit.dev/docs'

const MENU_ITEMS: MenuItem[] = [
  { id: 'manage', label: 'START MANAGING' },
  { id: 'docs', label: 'READ GUIDE' },
]

export function StartPage() {
  const navigate = useNavigate()
  const selectedPlayerCharacter = useStore((state) => state.selectedPlayerCharacter)
  const [selected, setSelected] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const invoke = useCallback(
    (index: number) => {
      const item = MENU_ITEMS[index]
      if (!item) return
      if (item.id === 'manage') {
        navigate('/manage')
      } else if (item.id === 'docs') {
        window.open(DOCS_URL, '_blank', 'noopener,noreferrer')
      }
    },
    [navigate],
  )

  useEffect(() => {
    if (settingsOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelected((cur) => (cur + 1) % MENU_ITEMS.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelected((cur) => (cur - 1 + MENU_ITEMS.length) % MENU_ITEMS.length)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        invoke(selected)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [invoke, selected, settingsOpen])

  return (
    <div className="start-page">
      <CockpitScene character={selectedPlayerCharacter} />

      <button
        type="button"
        className="start-settings-cog"
        aria-label="Open settings"
        onClick={() => setSettingsOpen(true)}
      >
        <svg
          className="start-settings-cog-icon"
          viewBox="0 0 24 24"
          width="28"
          height="28"
          aria-hidden
        >
          <path
            fill="currentColor"
            d="M10 2h4v3h1l2-2 3 3-2 2v1h3v4h-3v1l2 2-3 3-2-2h-1v3h-4v-3h-1l-2 2-3-3 2-2v-1H2v-4h3v-1L3 5l3-3 2 2h1V2zm2 7a3 3 0 100 6 3 3 0 000-6z"
          />
        </svg>
      </button>

      <main className="start-stage">
        <header className="start-header">
          <p className="start-eyebrow">PRE-FLIGHT CONSOLE</p>
          <h1 className="start-title">
            <span className="start-title-line">AGENT</span>
            <span className="start-title-line start-title-line--accent">COCKPIT</span>
          </h1>
          <p className="start-subtitle">PRESS ENTER · ↑ ↓ TO SELECT</p>
        </header>

        <StartMenu
          items={MENU_ITEMS}
          selected={selected}
          onHover={setSelected}
          onInvoke={invoke}
        />

        <footer className="start-footer">
          <span className="start-footer-meta">BUILD 0.1 · SECTOR 7G</span>
          <span className="start-footer-caret chat-terminal-caret" aria-hidden />
        </footer>
      </main>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

export default StartPage
