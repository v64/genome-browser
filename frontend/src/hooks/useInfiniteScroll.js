import { useEffect, useRef, useCallback } from 'react'

export function useInfiniteScroll(callback, hasMore, isLoading) {
  const observerRef = useRef(null)
  const loadMoreRef = useRef(null)

  const handleObserver = useCallback(
    (entries) => {
      const [entry] = entries
      if (entry.isIntersecting && hasMore && !isLoading) {
        callback()
      }
    },
    [callback, hasMore, isLoading]
  )

  useEffect(() => {
    const element = loadMoreRef.current
    if (!element) return

    observerRef.current = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: '100px',
      threshold: 0,
    })

    observerRef.current.observe(element)

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [handleObserver])

  return loadMoreRef
}
