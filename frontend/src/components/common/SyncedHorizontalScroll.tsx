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
 * Top bar appears only when content overflows the container.
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
        className={`synced-hscroll-top${overflowing ? ' is-visible' : ''}`}
        onScroll={onTopScroll}
        aria-hidden={!overflowing}
        tabIndex={overflowing ? 0 : -1}
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
