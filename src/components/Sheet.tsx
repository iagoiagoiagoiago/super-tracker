import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Bottom sheet modal with a dimmed backdrop. Closes on backdrop tap or Escape. */
export function Sheet({
  open,
  onClose,
  title,
  left,
  right,
  children,
  tall = false,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  left?: ReactNode
  right?: ReactNode
  children: ReactNode
  tall?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button aria-label="Close" className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`pb-safe relative mx-auto flex w-full max-w-lg flex-col rounded-t-[22px] border-t border-[#23272c] bg-[#121417] ${
          tall ? 'h-[88vh]' : 'max-h-[88vh]'
        } animate-[sheet-in_220ms_cubic-bezier(.2,.8,.2,1)]`}
      >
        <div className="flex justify-center pt-2">
          <div className="h-[5px] w-10 rounded-full bg-[#3a3f45]" />
        </div>
        {(title || left || right) && (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pt-2 pb-3">
            <div className="justify-self-start">{left}</div>
            <div className="text-center text-[17px] font-bold">{title}</div>
            <div className="justify-self-end">{right}</div>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
