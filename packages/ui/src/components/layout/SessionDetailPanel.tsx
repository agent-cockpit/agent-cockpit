import { Outlet } from 'react-router'

// Full session detail with tab navigation is implemented in Plan 03.
// This shell renders the active panel outlet for nested panel routes.
export function SessionDetailPanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  )
}
