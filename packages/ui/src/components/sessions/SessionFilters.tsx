import { useStore } from '../../store/index.js'

export function SessionFilters() {
  const filters = useStore((s) => s.filters)
  const setFilter = useStore((s) => s.setFilter)

  function handleProviderChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setFilter('provider', e.target.value === '' ? null : e.target.value)
  }

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setFilter('status', e.target.value === '' ? null : e.target.value)
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFilter('search', e.target.value || null)
  }

  return (
    <div className="flex items-center gap-2 px-2 py-2">
      <label className="flex items-center gap-1.5 [font-family:var(--font-sidebar-display)] text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        <span>Provider</span>
        <select
          aria-label="Provider"
          value={filters.provider ?? ''}
          onChange={handleProviderChange}
          className="rounded-md border border-border/60 bg-[var(--color-panel-surface)] px-2 py-1 text-xs text-foreground"
        >
          <option value="">all</option>
          <option value="claude">claude</option>
          <option value="codex">codex</option>
        </select>
      </label>

      <label className="flex items-center gap-1.5 [font-family:var(--font-sidebar-display)] text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        <span>Status</span>
        <select
          aria-label="Status"
          value={filters.status ?? ''}
          onChange={handleStatusChange}
          className="rounded-md border border-border/60 bg-[var(--color-panel-surface)] px-2 py-1 text-xs text-foreground"
        >
          <option value="">all</option>
          <option value="active">active</option>
          <option value="ended">ended</option>
        </select>
      </label>

      <input
        type="text"
        aria-label="Search"
        placeholder="Search workspace..."
        value={filters.search}
        onChange={handleSearchChange}
        className="flex-1 rounded-md border border-border/60 bg-[var(--color-panel-surface)] px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/60"
      />
    </div>
  )
}
