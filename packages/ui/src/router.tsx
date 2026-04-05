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
        Component: () => (
          <div className="flex items-center justify-center h-full p-8">
            <span className="text-sm">Select a session to get started.</span>
          </div>
        ),
      },
      {
        path: 'session/:sessionId',
        Component: SessionDetailPanel,
        children: [
          {
            path: 'approvals',
            lazy: async () => {
              const { ApprovalInbox } = await import('./components/panels/ApprovalInbox.js')
              return { Component: ApprovalInbox }
            },
          },
          {
            path: 'timeline',
            lazy: async () => {
              const { TimelinePanel } = await import('./components/panels/TimelinePanel.js')
              return { Component: TimelinePanel }
            },
          },
          {
            path: 'diff',
            lazy: async () => {
              const { DiffPanel } = await import('./components/panels/DiffPanel.js')
              return { Component: DiffPanel }
            },
          },
          {
            path: 'memory',
            lazy: async () => {
              const { MemoryPanel } = await import('./components/panels/MemoryPanel.js')
              return { Component: MemoryPanel }
            },
          },
          {
            path: 'artifacts',
            lazy: async () => {
              const { ArtifactsPanel } = await import('./components/panels/ArtifactsPanel.js')
              return { Component: ArtifactsPanel }
            },
          },
        ],
      },
    ],
  },
])
