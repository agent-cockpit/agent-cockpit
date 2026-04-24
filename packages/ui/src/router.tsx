import { createBrowserRouter } from 'react-router'
import { OpsLayout } from './components/layout/OpsLayout.js'

// `/` renders the StartPage (pixel-art title screen). `/manage` mounts the
// live OpsLayout + OfficePage game world. Session detail is still rendered
// inside the office as a popup overlay driven by store.sessionDetailOpen.
export const router = createBrowserRouter([
  {
    path: '/',
    lazy: () =>
      import('./pages/StartPage.js').then((m) => ({ Component: m.StartPage })),
  },
  {
    path: '/manage',
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
