import { describe, expect, it } from 'vitest'
import { getSessionTitle } from '../sessionTitle.js'

describe('getSessionTitle', () => {
  it('returns the last segment for POSIX paths', () => {
    expect(getSessionTitle('/repos/agent-cockpit')).toBe('agent-cockpit')
  })

  it('returns the last segment for Windows paths', () => {
    expect(getSessionTitle('C:\\Users\\leo\\agent-cockpit')).toBe('agent-cockpit')
  })

  it('falls back to session id prefix when workspace path is empty', () => {
    expect(getSessionTitle('', '1234567890abcdef')).toBe('12345678')
  })
})
