import { createBrowserRouter } from 'react-router'
import { OpsLayout } from './components/layout/OpsLayout.js'
import { SessionDetailPanel } from './components/layout/SessionDetailPanel.js'

// All panel imports use lazy loading for code splitting.
// React Router v7 Data Mode: import from "react-router" (not "react-router-dom").
export const router = createBrowserRouter([
  {
    path: '/',
    Component: OpsLayout,
    children: [
      {
        index: true,
        lazy: () =>
          import('./pages/OfficePage.js').then((m) => ({ Component: m.OfficePage })),
      },
      {
        path: 'session/:sessionId',
        Component: SessionDetailPanel,
        children: [
          {
            index: true,
            lazy: () =>
              import('./components/panels/ApprovalInbox.js').then((m) => ({ Component: m.ApprovalInbox })),
          },
          {
            path: 'approvals',
            lazy: () =>
              import('./components/panels/ApprovalInbox.js').then((m) => ({ Component: m.ApprovalInbox })),
          },
          {
            path: 'timeline',
            lazy: () =>
              import('./components/panels/TimelinePanel.js').then((m) => ({ Component: m.TimelinePanel })),
          },
          {
            path: 'diff',
            lazy: () =>
              import('./components/panels/DiffPanel.js').then((m) => ({ Component: m.DiffPanel })),
          },
          {
            path: 'memory',
            lazy: () =>
              import('./components/panels/MemoryPanel.js').then((m) => ({ Component: m.MemoryPanel })),
          },
          {
            path: 'artifacts',
            lazy: () =>
              import('./components/panels/ArtifactsPanel.js').then((m) => ({
                Component: m.ArtifactsPanel,
              })),
          },
        ],
      },
    ],
  },
])
