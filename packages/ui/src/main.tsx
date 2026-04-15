import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './router.js'
import { useSessionEvents } from './hooks/useSessionEvents.js'
import { useAudioBootstrap } from './audio/useAudioBootstrap.js'
import './index.css'

function App() {
  useAudioBootstrap()
  useSessionEvents()
  return <RouterProvider router={router} />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
