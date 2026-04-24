export interface MenuItem {
  id: string
  label: string
}

interface Props {
  items: MenuItem[]
  selected: number
  onHover: (index: number) => void
  onInvoke: (index: number) => void
}

export function StartMenu({ items, selected, onHover, onInvoke }: Props) {
  return (
    <ul className="start-menu" role="menu">
      {items.map((item, index) => {
        const isActive = index === selected
        return (
          <li key={item.id} role="none" className="start-menu-row">
            <button
              type="button"
              role="menuitem"
              data-selected={isActive ? 'true' : 'false'}
              className="start-menu-item"
              onMouseEnter={() => onHover(index)}
              onFocus={() => onHover(index)}
              onClick={() => onInvoke(index)}
            >
              <span className="start-menu-arrow" aria-hidden>
                {isActive ? '▶' : ''}
              </span>
              <span className="start-menu-label">{item.label}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
