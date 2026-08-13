import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

export type HorizontalScrollMetrics = {
  overflowing: boolean
  /** Thumb width as % of track */
  thumbWidthPct: number
  /** Thumb left offset as % of track */
  thumbLeftPct: number
}

const MIN_THUMB_PCT = 8

/**
 * Horizontal scroll metrics + sync for a custom always-visible top scrollbar.
 * Native overlay scrollbars are hidden; the custom track/thumb stays lit.
 */
export function useSyncedHorizontalScroll(deps: unknown[] = []) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const dragOffsetRef = useRef(0)
  const [metrics, setMetrics] = useState<HorizontalScrollMetrics>({
    overflowing: false,
    thumbWidthPct: 100,
    thumbLeftPct: 0,
  })

  const measure = useCallback(() => {
    const bottom = bottomRef.current
    if (!bottom) return

    const scrollWidth = bottom.scrollWidth
    const clientWidth = bottom.clientWidth
    const maxScroll = Math.max(0, scrollWidth - clientWidth)
    const overflowing = maxScroll > 1

    let thumbWidthPct = 100
    let thumbLeftPct = 0
    if (overflowing && scrollWidth > 0) {
      thumbWidthPct = Math.max(MIN_THUMB_PCT, (clientWidth / scrollWidth) * 100)
      const travel = 100 - thumbWidthPct
      thumbLeftPct = travel <= 0 ? 0 : (bottom.scrollLeft / maxScroll) * travel
    }

    setMetrics((prev) => {
      if (
        prev.overflowing === overflowing &&
        Math.abs(prev.thumbWidthPct - thumbWidthPct) < 0.05 &&
        Math.abs(prev.thumbLeftPct - thumbLeftPct) < 0.05
      ) {
        return prev
      }
      return { overflowing, thumbWidthPct, thumbLeftPct }
    })
  }, [])

  useLayoutEffect(() => {
    measure()
    const bottom = bottomRef.current
    if (!bottom) return

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(measure)
    })
    observer.observe(bottom)
    const content = bottom.firstElementChild
    if (content) observer.observe(content)
    const table = bottom.querySelector('table')
    if (table && table !== content) observer.observe(table)

    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller supplies change tokens
  }, [measure, ...deps])

  const onBottomScroll = useCallback(() => {
    if (draggingRef.current) return
    measure()
  }, [measure])

  const scrollFromClientX = useCallback((clientX: number, thumbWidthPx?: number) => {
    const bottom = bottomRef.current
    const track = trackRef.current
    if (!bottom || !track) return

    const rect = track.getBoundingClientRect()
    const trackWidth = rect.width
    if (trackWidth <= 0) return

    const scrollWidth = bottom.scrollWidth
    const clientWidth = bottom.clientWidth
    const maxScroll = Math.max(0, scrollWidth - clientWidth)
    if (maxScroll <= 0) return

    const thumbW =
      thumbWidthPx ??
      Math.max((clientWidth / scrollWidth) * trackWidth, (MIN_THUMB_PCT / 100) * trackWidth)
    const travel = Math.max(1, trackWidth - thumbW)
    const x = clientX - rect.left - dragOffsetRef.current
    const ratio = Math.min(1, Math.max(0, x / travel))
    bottom.scrollLeft = ratio * maxScroll
    measure()
  }, [measure])

  const onThumbPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const bottom = bottomRef.current
      const track = trackRef.current
      if (!bottom || !track) return

      event.preventDefault()
      event.stopPropagation()
      const thumb = event.currentTarget
      const thumbRect = thumb.getBoundingClientRect()
      dragOffsetRef.current = event.clientX - thumbRect.left
      draggingRef.current = true
      thumb.setPointerCapture(event.pointerId)

      const onMove = (e: PointerEvent) => {
        scrollFromClientX(e.clientX, thumbRect.width)
      }
      const onUp = () => {
        draggingRef.current = false
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [scrollFromClientX],
  )

  const onTrackPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // Click on track (not thumb): jump so thumb centers under cursor
      if ((event.target as HTMLElement).closest('.synced-hscroll-thumb')) return
      const bottom = bottomRef.current
      const track = trackRef.current
      if (!bottom || !track) return

      const scrollWidth = bottom.scrollWidth
      const clientWidth = bottom.clientWidth
      if (scrollWidth <= clientWidth + 1) return

      const rect = track.getBoundingClientRect()
      const thumbW = Math.max(
        (clientWidth / scrollWidth) * rect.width,
        (MIN_THUMB_PCT / 100) * rect.width,
      )
      dragOffsetRef.current = thumbW / 2
      scrollFromClientX(event.clientX, thumbW)
    },
    [scrollFromClientX],
  )

  return {
    bottomRef,
    trackRef,
    metrics,
    onBottomScroll,
    onThumbPointerDown,
    onTrackPointerDown,
    measure,
  }
}
