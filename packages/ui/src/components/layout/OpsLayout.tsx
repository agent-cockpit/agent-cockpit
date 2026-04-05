import { Outlet } from 'react-router'
import { SessionListPanel } from './SessionListPanel.js'

export function OpsLayout() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="w-72 flex-none border-r overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b">
          <h1 className="text-sm font-semibold">Agent Cockpit</h1>
        </div>
        <SessionListPanel />
      </aside>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
