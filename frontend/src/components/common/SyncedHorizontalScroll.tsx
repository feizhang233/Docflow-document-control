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
 * Horizontal scroll region with a slim dual-synced top scrollbar.
 * Top track is always visible (常亮); content still syncs bidirectionally.
 */
export function SyncedHorizontalScroll({
  children,
  className,
  contentClassName = 'table-scroll',
  deps = [],
  'aria-label': ariaLabel,
}: Props) {
  const {
    topRef,
    bottomRef,
    spacerRef,
    overflowing,
    onTopScroll,
    onBottomScroll,
  } = useSyncedHorizontalScroll(deps)

  return (
    <div className={`synced-hscroll${className ? ` ${className}` : ''}${overflowing ? ' is-overflowing' : ''}`}>
      <div
        ref={topRef}
        className="synced-hscroll-top"
        onScroll={onTopScroll}
        aria-hidden={false}
        tabIndex={0}
        title={overflowing ? 'Horizontal scroll' : 'Table fits the view'}
      >
        <div ref={spacerRef} className="synced-hscroll-spacer" />
      </div>
      <div
        ref={bottomRef}
        className={contentClassName}
        onScroll={onBottomScroll}
        aria-label={ariaLabel}
      >
        {children}
      </div>
    </div>
  )
}
