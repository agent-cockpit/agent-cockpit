import type { Workflow } from './useWorkflows.js'

interface Props {
  workflows: Workflow[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onNew: () => void
}

const MONO: React.CSSProperties = {
  fontFamily: '"DM Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
}

const UI: React.CSSProperties = {
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
}

export function WorkspaceSidebar({ workflows, selectedId, onSelect, onRemove, onNew }: Props) {
  return (
    <div
      style={{
        width: '160px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--w-canvas-soft)',
        borderRight: '1px solid var(--w-hairline)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--w-hairline)',
        }}
      >
        <span
          style={{
            ...MONO,
            fontSize: '9px',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--w-muted)',
          }}
        >
          Workflows
        </span>
        <button
          type="button"
          onClick={onNew}
          title="New workflow"
          style={{
            ...UI,
            fontSize: '14px',
            fontWeight: 400,
            color: 'var(--w-body)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0 4px',
            lineHeight: 1,
            borderRadius: '3px',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--w-ink)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--w-body)' }}
        >
          +
        </button>
      </div>

      {/* Tab list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {workflows.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center' }}>
            <p
              style={{
                ...MONO,
                fontSize: '10px',
                color: 'var(--w-muted)',
                marginBottom: '12px',
                lineHeight: 1.6,
              }}
            >
              No workflows yet
            </p>
            <button
              type="button"
              onClick={onNew}
              style={{
                ...UI,
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--w-on-primary)',
                background: 'var(--w-primary)',
                border: 'none',
                borderRadius: '3px',
                padding: '6px 10px',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              + New
            </button>
          </div>
        ) : (
          workflows.map((wf) => {
            const isSelected = selectedId === wf.id
            return (
              <div
                key={wf.id}
                style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
                className="group"
              >
                <button
                  type="button"
                  onClick={() => onSelect(wf.id)}
                  title={wf.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flex: 1,
                    minWidth: 0,
                    padding: '8px 16px 8px 14px',
                    textAlign: 'left',
                    background: isSelected
                      ? 'rgba(232,232,240,0.05)'
                      : 'none',
                    border: 'none',
                    borderLeft: isSelected
                      ? '2px solid var(--w-ink)'
                      : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(232,232,240,0.03)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'none'
                  }}
                >
                  <span style={{ ...MONO, fontSize: '10px', color: 'var(--w-muted)', flexShrink: 0 }}>
                    &gt;_
                  </span>
                  <span
                    style={{
                      ...UI,
                      fontSize: '13px',
                      fontWeight: isSelected ? 500 : 400,
                      color: isSelected ? 'var(--w-ink)' : 'var(--w-body)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {wf.name}
                  </span>
                </button>

                {/* Remove button — appears on hover */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemove(wf.id) }}
                  title="Remove"
                  className="opacity-0 group-hover:opacity-100"
                  style={{
                    position: 'absolute',
                    right: '8px',
                    ...MONO,
                    fontSize: '11px',
                    color: 'var(--w-muted)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    borderRadius: '2px',
                    transition: 'opacity 0.1s',
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
