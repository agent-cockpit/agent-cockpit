import { Outlet } from 'react-router'
import { useState } from 'react'
import { MapSidebar } from './MapSidebar.js'
import { HistoryPopup } from '../office/HistoryPopup.js'

export function OpsLayout() {
  const [historyOpen, setHistoryOpen] = useState(false)

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="w-72 flex-none border-r overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h1 className="text-sm font-semibold">Agent Cockpit</h1>
          <button
            onClick={() => setHistoryOpen(true)}
            className="text-sm px-3 py-1.5 rounded hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            History
          </button>
        </div>
        <MapSidebar onFocusSession={() => {}} />
      </aside>
      <main className="flex-1 overflow-hidden">
        <Outlet />
        <HistoryPopup open={historyOpen} onClose={() => setHistoryOpen(false)} />
      </main>
    </div>
  )
}
