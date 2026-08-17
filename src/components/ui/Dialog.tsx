import { useEffect, useRef, type ReactNode } from "react"

export function Dialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement as HTMLElement
    const priorOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const focusable = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[href]') || [])
    focusable()[0]?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current()
      if (event.key === "Tab") {
        const items = focusable(); if (!items.length) return
        const first = items[0], last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener("keydown", keydown)
    return () => { document.body.style.overflow = priorOverflow; document.removeEventListener("keydown", keydown); returnFocus.current?.focus() }
  }, [open])
  if (!open) return null
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={panelRef} className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button className="dialog-close" onClick={onClose} aria-label="Close dialog">×</button></div>
      {children}
    </div>
  </div>
}
