import { useEffect, useRef, type RefObject } from 'react'

export function useDismissableLayer<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
  extraRefs: Array<RefObject<HTMLElement | null>> = [],
) {
  const layerRef = useRef<T>(null)
  const closeRef = useRef(onClose)
  const extraRefsRef = useRef(extraRefs)
  closeRef.current = onClose
  extraRefsRef.current = extraRefs

  useEffect(() => {
    if (!open) return
    const isInside = (target: Node) =>
      Boolean(layerRef.current?.contains(target) || extraRefsRef.current.some((ref) => ref.current?.contains(target)))
    const closeOutside = (event: MouseEvent) => {
      if (!isInside(event.target as Node)) closeRef.current()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return layerRef
}
