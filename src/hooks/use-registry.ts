import type { CodexRegistry } from '../types'
import { useCallback, useEffect, useState } from 'react'
import { readRegistry } from '../utils/registry'

export function useRegistryState() {
  const [data, setData] = useState<CodexRegistry>()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>()

  const reload = useCallback(async () => {
    setIsLoading(true)
    setError(undefined)

    try {
      const next = await readRegistry()
      setData(next)
    }
    catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    }
    finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return {
    data,
    isLoading,
    error,
    reload,
  }
}
