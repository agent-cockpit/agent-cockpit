import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CHARACTER_TYPES } from '../../office/characterMapping.js'
import { CharacterPicker } from '../CharacterPicker.js'

describe('CharacterPicker', () => {
  it('renders the current face portrait and formatted character name', () => {
    render(
      <CharacterPicker
        value="astronaut"
        onChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByRole('img', { name: 'Astronaut face portrait' })).toHaveAttribute(
      'src',
      '/sprites/faces/astronaut-face.png',
    )
    expect(screen.getByText('Astronaut')).toBeInTheDocument()
  })

  it('wraps to the last character when selecting previous from the first character', () => {
    const onChange = vi.fn()

    render(
      <CharacterPicker
        value={CHARACTER_TYPES[0]}
        onChange={onChange}
        onConfirm={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /previous character/i }))
    expect(onChange).toHaveBeenCalledWith('medicine-woman')
  })

  it('wraps to the first character when selecting next from the last character', () => {
    const onChange = vi.fn()

    render(
      <CharacterPicker
        value={CHARACTER_TYPES[CHARACTER_TYPES.length - 1]}
        onChange={onChange}
        onConfirm={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /next character/i }))
    expect(onChange).toHaveBeenCalledWith('astronaut')
  })

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn()

    render(
      <CharacterPicker
        value="astronaut"
        onChange={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /confirm character/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
