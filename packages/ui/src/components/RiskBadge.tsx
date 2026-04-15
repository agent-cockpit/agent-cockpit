import React from 'react'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

interface RiskBadgeProps {
  level: RiskLevel
  className?: string
}

export function RiskBadge({ level, className }: RiskBadgeProps) {
  return (
    <img
      src={`/sprites/badge-${level}.png`}
      alt={`${level} risk`}
      style={{ imageRendering: 'pixelated' }}
      className={className}
    />
  )
}
