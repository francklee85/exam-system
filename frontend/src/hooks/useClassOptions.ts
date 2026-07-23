import { useCallback, useEffect, useState } from 'react'

import { listAllClasses } from '../api/classes'
import type { ClassInfo } from '../types/class'
import type { RecordStatus } from '../types/common'

interface UseClassOptionsParams {
  majorId?: number
  status?: RecordStatus
  enabled?: boolean
}

interface UseClassOptionsResult {
  classes: ClassInfo[]
  isLoading: boolean
  error: unknown
  reload: () => void
}

export function useClassOptions({
  majorId,
  status,
  enabled = true,
}: UseClassOptionsParams = {}): UseClassOptionsResult {
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<unknown>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setClasses([])
      setIsLoading(false)
      setError(null)
      return
    }

    let isCurrent = true
    setIsLoading(true)
    setError(null)

    void listAllClasses({ major_id: majorId, status })
      .then((items) => {
        if (isCurrent) {
          setClasses(items)
        }
      })
      .catch((requestError: unknown) => {
        if (isCurrent) {
          setError(requestError)
          setClasses([])
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false)
        }
      })

    return () => {
      isCurrent = false
    }
  }, [enabled, majorId, reloadToken, status])

  const reload = useCallback(() => {
    setReloadToken((current) => current + 1)
  }, [])

  return { classes, isLoading, error, reload }
}
