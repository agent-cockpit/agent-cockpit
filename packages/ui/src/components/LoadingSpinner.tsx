import React from 'react'

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <img
      src="/sprites/loading-animation.png"
      alt="loading"
      style={{ imageRendering: 'pixelated' }}
      className={className}
    />
  )
}
