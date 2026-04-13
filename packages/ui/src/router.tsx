import { createBrowserRouter } from 'react-router'
import { OpsLayout } from './components/layout/OpsLayout.js'

// Session detail is rendered as a popup overlay (InstancePopupHub) driven by
// store.sessionDetailOpen — not as a route. OfficePage is always the base view.
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
    ],
  },
])
