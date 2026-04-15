import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLocalStorage } from '../hooks/useLocalStorage.js'

beforeEach(() => {
  localStorage.clear()
})

describe('useLocalStorage', () => {
  it('returns defaultValue when key is absent from localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'))
    expect(result.current[0]).toBe('default')
  })

  it('returns numeric defaultValue when key is absent', () => {
    const { result } = renderHook(() => useLocalStorage('num-key', 42))
    expect(result.current[0]).toBe(42)
  })

  it('returns stored value when key exists in localStorage', () => {
    localStorage.setItem('existing-key', JSON.stringify({ x: 1, y: 2 }))
    const { result } = renderHook(() => useLocalStorage('existing-key', {}))
    expect(result.current[0]).toEqual({ x: 1, y: 2 })
  })

  it('setter(newValue) persists to localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('persist-key', 'initial'))
    act(() => {
      result.current[1]('updated')
    })
    expect(localStorage.getItem('persist-key')).toBe(JSON.stringify('updated'))
    expect(result.current[0]).toBe('updated')
  })

  it('setter(prev => newValue) functional updater works', () => {
    localStorage.setItem('fn-key', JSON.stringify({ id1: { x: 0, y: 0 } }))
    const { result } = renderHook(() =>
      useLocalStorage<Record<string, { x: number; y: number }>>('fn-key', {}),
    )
    act(() => {
      result.current[1]((prev) => ({ ...prev, id2: { x: 1, y: 1 } }))
    })
    expect(result.current[0]).toEqual({ id1: { x: 0, y: 0 }, id2: { x: 1, y: 1 } })
  })

  it('returns defaultValue when localStorage.getItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const { result } = renderHook(() => useLocalStorage('throw-key', 'fallback'))
    expect(result.current[0]).toBe('fallback')
    spy.mockRestore()
  })

  it('returns defaultValue when stored JSON is malformed', () => {
    localStorage.setItem('bad-json', '{not valid json')
    const { result } = renderHook(() => useLocalStorage('bad-json', { default: true }))
    expect(result.current[0]).toEqual({ default: true })
  })
})
