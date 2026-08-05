import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/**
 * Bidirectional horizontal scroll sync between a slim top scrollbar and a
 * content scroller. Shows the top bar only when content overflows.
 */
export function useSyncedHorizontalScroll(deps: unknown[] = []) {
  const topRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const spacerRef = useRef<HTMLDivElement>(null)
  const syncingRef = useRef(false)
  const [overflowing, setOverflowing] = useState(false)

  const measure = useCallback(() => {
    const bottom = bottomRef.current
    const spacer = spacerRef.current
    const top = topRef.current
    if (!bottom) return

    const scrollWidth = bottom.scrollWidth
    const clientWidth = bottom.clientWidth
    const needs = scrollWidth > clientWidth + 1
    setOverflowing(needs)

    if (spacer) spacer.style.width = `${scrollWidth}px`
    if (top && top.scrollLeft !== bottom.scrollLeft) {
      syncingRef.current = true
      top.scrollLeft = bottom.scrollLeft
      requestAnimationFrame(() => {
        syncingRef.current = false
      })
    }
  }, [])

  useLayoutEffect(() => {
    measure()
    const bottom = bottomRef.current
    if (!bottom) return

    const observer = new ResizeObserver(() => {
      // Defer to next frame so layout after column resize has settled
      requestAnimationFrame(measure)
    })
    observer.observe(bottom)
    const content = bottom.firstElementChild
    if (content) observer.observe(content)
    // Observe nested table when present (DndContext wraps the table)
    const table = bottom.querySelector('table')
    if (table && table !== content) observer.observe(table)

    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller supplies change tokens
  }, [measure, ...deps])

  const onTopScroll = useCallback(() => {
    const top = topRef.current
    const bottom = bottomRef.current
    if (syncingRef.current || !top || !bottom) return
    if (bottom.scrollLeft === top.scrollLeft) return
    syncingRef.current = true
    bottom.scrollLeft = top.scrollLeft
    requestAnimationFrame(() => {
      syncingRef.current = false
    })
  }, [])

  const onBottomScroll = useCallback(() => {
    const top = topRef.current
    const bottom = bottomRef.current
    if (syncingRef.current || !top || !bottom) return
    if (top.scrollLeft === bottom.scrollLeft) return
    syncingRef.current = true
    top.scrollLeft = bottom.scrollLeft
    requestAnimationFrame(() => {
      syncingRef.current = false
    })
  }, [])

  return {
    topRef,
    bottomRef,
    spacerRef,
    overflowing,
    onTopScroll,
    onBottomScroll,
    measure,
  }
}
