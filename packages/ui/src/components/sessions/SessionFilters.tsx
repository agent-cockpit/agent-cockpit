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
    <div className="flex items-center gap-3 p-2">
      <label className="flex items-center gap-1 text-sm">
        <span>Provider</span>
        <select
          aria-label="Provider"
          value={filters.provider ?? ''}
          onChange={handleProviderChange}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="">all</option>
          <option value="claude">claude</option>
          <option value="codex">codex</option>
        </select>
      </label>

      <label className="flex items-center gap-1 text-sm">
        <span>Status</span>
        <select
          aria-label="Status"
          value={filters.status ?? ''}
          onChange={handleStatusChange}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
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
        className="rounded border border-gray-300 px-2 py-1 text-sm"
      />
    </div>
  )
}
