import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { RiskBadge } from '../components/RiskBadge.js'

describe('RiskBadge', () => {
  it('renders img with correct src for low', () => {
    const { container } = render(<RiskBadge level="low" />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.src).toContain('/sprites/badge-low.png')
  })

  it('renders img with correct src for medium', () => {
    const { container } = render(<RiskBadge level="medium" />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.src).toContain('/sprites/badge-medium.png')
  })

  it('renders img with correct src for high', () => {
    const { container } = render(<RiskBadge level="high" />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.src).toContain('/sprites/badge-high.png')
  })

  it('renders img with correct src for critical', () => {
    const { container } = render(<RiskBadge level="critical" />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.src).toContain('/sprites/badge-critical.png')
  })

  it('alt text contains the level name', () => {
    const { container } = render(<RiskBadge level="critical" />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.alt).toContain('critical')
  })

  it('has imageRendering pixelated style', () => {
    const { container } = render(<RiskBadge level="low" />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.style.imageRendering).toBe('pixelated')
  })

  it('passes className to img', () => {
    const { container } = render(<RiskBadge level="high" className="w-6 h-4" />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.className).toContain('w-6')
  })
})
