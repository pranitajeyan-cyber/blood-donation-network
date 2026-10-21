import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError } from '../api/client'

export interface AsyncState<T> {
  data: T | null
  error: string | null
  /** True only on the very first load — refreshes keep the old data on screen. */
  loading: boolean
  /** True while a background refresh is running over existing data. */
  refreshing: boolean
  reload: () => Promise<void>
  setData: (updater: T | ((current: T | null) => T | null)) => void
}

/**
 * Fetch-on-mount with explicit loading / error / empty handling.
 *
 * `loader` is held in a ref so callers can pass an inline closure without
 * causing an infinite re-fetch loop on every render.
 */
export function useApi<T>(
  loader: () => Promise<T>,
  deps: React.DependencyList = [],
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(async () => {
    setError(null)
    setRefreshing(true)
    try {
      const result = await loaderRef.current()
      if (!mounted.current) return
      setData(result)
    } catch (caught) {
      if (!mounted.current) return
      const message =
        caught instanceof ApiError
          ? caught.detail
          : caught instanceof Error
            ? caught.message
            : 'Something went wrong.'
      setError(message)
    } finally {
      if (mounted.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const update = useCallback(
    (updater: T | ((current: T | null) => T | null)) => {
      setData((current) =>
        typeof updater === 'function'
          ? (updater as (c: T | null) => T | null)(current)
          : updater,
      )
    },
    [],
  )

  return { data, error, loading, refreshing, reload: run, setData: update }
}

/** Tracks the state of a one-shot mutation (form submit, button press). */
export function useMutation<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TResult | null>(null)
  const actionRef = useRef(action)
  actionRef.current = action
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const mutate = useCallback(async (...args: TArgs): Promise<TResult | null> => {
    setPending(true)
    setError(null)
    try {
      const value = await actionRef.current(...args)
      if (alive.current) setResult(value)
      return value
    } catch (caught) {
      const message =
        caught instanceof ApiError
          ? caught.detail
          : caught instanceof Error
            ? caught.message
            : 'Something went wrong.'
      if (alive.current) setError(message)
      return null
    } finally {
      if (alive.current) setPending(false)
    }
  }, [])

  const reset = useCallback(() => {
    setError(null)
    setResult(null)
  }, [])

  return { mutate, pending, error, result, reset }
}
