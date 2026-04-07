import { describe, it } from 'vitest'

// Wave 0 stubs — these will be implemented in Plan 03 (Wave 1).
// All tests are it.todo() so they are counted as "pending" in vitest, not failures.

describe('MEM-01: Read CLAUDE.md + auto memory', () => {
  it.todo('renders CLAUDE.md content from fetch response')
  it.todo('renders auto memory section')
})

describe('MEM-02: Edit CLAUDE.md', () => {
  it.todo('textarea pre-filled with CLAUDE.md content')
  it.todo('save button triggers PUT request')
  it.todo('shows active-session warning when session.status is active')
})

describe('MEM-03: Memory notes', () => {
  it.todo('renders notes list from GET /api/memory/notes response')
  it.todo('new note form submits POST and refreshes list')
})

describe('MEM-04: Suggested memory writes', () => {
  it.todo('renders pending suggestion cards for memory_write events with suggested=true')
  it.todo('approve button sends POST to /api/memory/suggestions/:id/approve')
  it.todo('reject button sends DELETE to /api/memory/suggestions/:id')
})
