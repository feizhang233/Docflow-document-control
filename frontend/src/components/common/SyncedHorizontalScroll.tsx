import type { ReactNode } from 'react'
import { useSyncedHorizontalScroll } from '../../hooks/useSyncedHorizontalScroll'

interface Props {
  children: ReactNode
  /** Extra class on the outer wrapper */
  className?: string
  /** Class applied to the bottom content scroller (default: table-scroll) */
  contentClassName?: string
  /** Tokens that should force a remeasure (column widths, row count, etc.) */
  deps?: unknown[]
  /** Accessible label for the scroll region */
  'aria-label'?: string
}

/**
 * Horizontal scroll region with a custom dual-synced top scrollbar.
 * Track is always painted (常亮); does not rely on native overlay scrollbars.
 */
export function SyncedHorizontalScroll({
  children,
  className,
  contentClassName = 'table-scroll',
  deps = [],
  'aria-label': ariaLabel,
}: Props) {
  const {
    bottomRef,
    trackRef,
    metrics,
    onBottomScroll,
    onThumbPointerDown,
    onTrackPointerDown,
  } = useSyncedHorizontalScroll(deps)

  const { overflowing, thumbWidthPct, thumbLeftPct } = metrics

  return (
    <div
      className={`synced-hscroll${className ? ` ${className}` : ''}${overflowing ? ' is-overflowing' : ''}`}
    >
      <div
        ref={trackRef}
        className="synced-hscroll-track"
        onPointerDown={onTrackPointerDown}
        role="scrollbar"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(thumbLeftPct)}
        title={overflowing ? 'Horizontal scroll' : 'Table fits the view'}
      >
        <div
          className={`synced-hscroll-thumb${overflowing ? '' : ' is-full'}`}
          style={{ width: `${thumbWidthPct}%`, left: `${thumbLeftPct}%` }}
          onPointerDown={onThumbPointerDown}
        />
      </div>
      <div
        ref={bottomRef}
        className={`${contentClassName} synced-hscroll-body`}
        onScroll={onBottomScroll}
        aria-label={ariaLabel}
      >
        {children}
      </div>
    </div>
  )
}
