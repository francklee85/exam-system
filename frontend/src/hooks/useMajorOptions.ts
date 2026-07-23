import { useCallback, useEffect, useState } from 'react'

import { listAllMajors } from '../api/majors'
import type { RecordStatus } from '../types/common'
import type { Major } from '../types/major'

interface UseMajorOptionsResult {
  majors: Major[]
  isLoading: boolean
  error: unknown
  reload: () => void
}

export function useMajorOptions(status?: RecordStatus): UseMajorOptionsResult {
  const [majors, setMajors] = useState<Major[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let isCurrent = true
    setIsLoading(true)
    setError(null)

    void listAllMajors(status)
      .then((items) => {
        if (isCurrent) {
          setMajors(items)
        }
      })
      .catch((requestError: unknown) => {
        if (isCurrent) {
          setError(requestError)
          setMajors([])
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
  }, [reloadToken, status])

  const reload = useCallback(() => {
    setReloadToken((current) => current + 1)
  }, [])

  return { majors, isLoading, error, reload }
}
