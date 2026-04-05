import { Outlet } from 'react-router'

// Full session list sidebar and detail panel are implemented in Plan 03.
// This shell provides the two-column layout structure for nested routes.
export function OpsLayout() {
  return (
    <div className="flex h-screen">
      <aside className="w-64 border-r" id="session-list-panel">{/* Plan 03 */}</aside>
      <main className="flex-1"><Outlet /></main>
    </div>
  )
}
