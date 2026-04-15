import { useState, useCallback } from 'react'

export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [T, (updater: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored === null) return defaultValue
      return JSON.parse(stored) as T
    } catch {
      return defaultValue
    }
  })

  const setAndPersist = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = typeof updater === 'function'
          ? (updater as (prev: T) => T)(prev)
          : updater
        try {
          localStorage.setItem(key, JSON.stringify(next))
        } catch {
          // ignore write errors (e.g., quota exceeded)
        }
        return next
      })
    },
    [key],
  )

  return [value, setAndPersist]
}
