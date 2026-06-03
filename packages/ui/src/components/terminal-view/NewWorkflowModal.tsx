import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (name: string) => void
}

const MONO: React.CSSProperties = { fontFamily: '"DM Mono", ui-monospace, SFMono-Regular, Menlo, monospace' }
const UI: React.CSSProperties = { fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }

const inputBase: React.CSSProperties = {
  fontSize: '12px',
  width: '100%',
  background: 'var(--color-sidebar)',
  color: 'var(--color-foreground)',
  border: '1px solid var(--color-border)',
  borderRadius: '3px',
  padding: '8px 10px',
  outline: 'none',
  boxSizing: 'border-box',
}

export function NewWorkflowModal({ open, onClose, onConfirm }: Props) {
  const [name, setName] = useState('')

  if (!open) return null

  function handleClose() { setName(''); onClose() }

  function handleConfirm(e: React.FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    onConfirm(n)
    handleClose()
  }

  const focusBorder = (e: React.FocusEvent<HTMLInputElement>) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-muted-foreground)' }
  const blurBorder  = (e: React.FocusEvent<HTMLInputElement>) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)' }

  return (
    <div role="dialog" aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 9900, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,8,0.72)', backdropFilter: 'blur(2px)' }}>
      <div style={{ width: '100%', maxWidth: '380px', background: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '24px', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <p style={{ ...MONO, fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-cockpit-dim)' }}>New Workflow</p>
          <button type="button" onClick={handleClose} style={{ ...MONO, fontSize: '16px', color: 'var(--color-cockpit-dim)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '2px 4px' }}>×</button>
        </div>

        <form onSubmit={handleConfirm}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ ...MONO, fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-cockpit-dim)', display: 'block', marginBottom: '6px' }}>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Feature branch, Bug fix…" required autoFocus
              style={{ ...inputBase, ...UI, fontSize: '13px' }}
              onFocus={focusBorder} onBlur={blurBorder} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={handleClose}
              style={{ ...UI, fontSize: '13px', color: 'var(--color-muted-foreground)', background: 'none', border: '1px solid var(--color-border)', borderRadius: '3px', padding: '8px 14px', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit"
              style={{ ...UI, fontSize: '13px', fontWeight: 500, color: 'var(--color-background)', background: 'var(--color-foreground)', border: 'none', borderRadius: '3px', padding: '8px 14px', cursor: 'pointer' }}>
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
