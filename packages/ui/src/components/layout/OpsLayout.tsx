import { Outlet, NavLink } from 'react-router'
import { SessionListPanel } from './SessionListPanel.js'

export function OpsLayout() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="w-72 flex-none border-r overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h1 className="text-sm font-semibold">Agent Cockpit</h1>
          <NavLink
            to="/history"
            className={({ isActive }) =>
              `text-xs px-2 py-1 rounded ${isActive ? 'bg-muted font-semibold' : 'text-muted-foreground hover:text-foreground'}`
            }
          >
            History
          </NavLink>
          <NavLink
            to="/office"
            className={({ isActive }) =>
              `text-xs px-2 py-1 rounded ${isActive ? 'bg-muted font-semibold' : 'text-muted-foreground hover:text-foreground'}`
            }
          >
            Office
          </NavLink>
        </div>
        <SessionListPanel />
      </aside>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
